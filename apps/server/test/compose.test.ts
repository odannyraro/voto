import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { migrate } from '../src/adapters/pg/migrate';
import { PgAdminRepository } from '../src/adapters/pg/pg-admin-repository';
import { PgElectionRepository } from '../src/adapters/pg/pg-election-repository';
import { createServer, type DatabasePoolOptions } from '../src/compose';
import { loadConfig } from '../src/config';
import { createPgMemDatabasePool, type PgMemDatabasePool } from './doubles/pg-mem-pool';
import { openElectionWithVoters, withOpenRound } from './support/election-fixtures';

const OK = 200;
const UNAUTHORIZED = 401;

const MEMORY_ENV = { NODE_ENV: 'test', BCRYPT_ROUNDS: '4' };
const DATABASE_URL = 'postgres://db.example.test/voto';
// Com banco real o segredo JWT é obrigatório, mesmo fora de produção (config.ts).
const PG_ENV = { ...MEMORY_ENV, REPOSITORY: 'pg', DATABASE_URL, JWT_SECRET: 'compose-test-secret' };
const ADMIN_ENV = { ADMIN_USERNAME: 'ana', ADMIN_PASSWORD: 'ana-password' };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.useRealTimers();
});

/**
 * Tenta o login do admin por HTTP.
 *
 * @param server - Servidor montado pelo `createServer`.
 * @param password - Senha tentada para o usuário `ana`.
 * @returns O status da resposta.
 */
async function logInAsAna(server: FastifyInstance, password: string): Promise<number> {
  const response = await server.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { username: 'ana', password },
  });
  return response.statusCode;
}

/**
 * Prepara um banco em memória como o de produção antes de um reinício: tabelas criadas e a
 * eleição `e1` com uma rodada de 60 s aberta no instante dado.
 *
 * @param openedAt - Quando a rodada foi aberta.
 * @returns O pool do banco, para ser entregue ao `createServer`.
 */
async function databaseWithRoundOpenedAt(openedAt: Date): Promise<PgMemDatabasePool> {
  const pool = createPgMemDatabasePool();
  await migrate(pool);
  const election = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });
  await new PgElectionRepository(pool).create(
    withOpenRound(election, { positionId: 'president', roundId: 'round-1', openedAt }),
  );
  return pool;
}

describe('createServer with the in-memory repository', () => {
  it('answers the health check', async () => {
    app = await createServer(loadConfig(MEMORY_ENV));

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(OK);
  });

  it('seeds the admin from the configuration, so they can log in', async () => {
    app = await createServer(loadConfig({ ...MEMORY_ENV, ...ADMIN_ENV }));

    const status = await logInAsAna(app, 'ana-password');

    expect(status).toBe(OK);
  });

  it('starts without any admin when no credentials are configured', async () => {
    app = await createServer(loadConfig(MEMORY_ENV));

    const status = await logInAsAna(app, 'ana-password');

    expect(status).toBe(UNAUTHORIZED);
  });

  it('does not touch the database even when DATABASE_URL is also set', async () => {
    const createPool = vi.fn(createPgMemDatabasePool);

    app = await createServer(loadConfig({ ...MEMORY_ENV, DATABASE_URL }), { createPool });

    expect(createPool).not.toHaveBeenCalled();
  });

  it('serves the frontend build when WEB_DIST_DIR is set', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'voto-web-dist-'));
    onTestFinished(() => rm(distDir, { recursive: true, force: true }));
    await writeFile(join(distDir, 'index.html'), '<title>Voto</title>');
    app = await createServer(loadConfig({ ...MEMORY_ENV, WEB_DIST_DIR: distDir }));

    const response = await app.inject({ method: 'GET', url: '/admin/elections' });

    expect(response.body).toBe('<title>Voto</title>');
  });
});

describe('createServer with the PostgreSQL repository', () => {
  it('connects to DATABASE_URL with a time limit for each query', async () => {
    const received: DatabasePoolOptions[] = [];
    const createPool = (options: DatabasePoolOptions) => {
      received.push(options);
      return createPgMemDatabasePool();
    };

    app = await createServer(loadConfig(PG_ENV), { createPool });

    expect(received).toEqual([
      { connectionString: DATABASE_URL, query_timeout: expect.any(Number) },
    ]);
  });

  it('refuses to start without a database address', async () => {
    // O `loadConfig` já barra isso; a guarda vale para uma `Config` montada à mão.
    const config = { ...loadConfig(PG_ENV), databaseUrl: undefined };

    const starting = createServer(config, { createPool: createPgMemDatabasePool });

    await expect(starting).rejects.toThrow('DATABASE_URL is required when REPOSITORY is pg');
  });

  it('creates the tables and stores the seeded admin in the database', async () => {
    const pool = createPgMemDatabasePool();

    app = await createServer(loadConfig({ ...PG_ENV, ...ADMIN_ENV }), { createPool: () => pool });

    expect(await new PgAdminRepository(pool).findByUsername('ana')).toMatchObject({
      username: 'ana',
    });
  });

  it('keeps running when an idle database connection fails', async () => {
    // Sem ouvinte, o `error` do pool (queda de conexão ociosa, comum no Neon) derruba o processo.
    const pool = createPgMemDatabasePool();
    app = await createServer(loadConfig(PG_ENV), { createPool: () => pool });

    const failing = () => pool.emit('error', new Error('Connection terminated unexpectedly'));

    expect(failing).not.toThrow();
  });

  it('ends the database pool when the server closes', async () => {
    const pool = createPgMemDatabasePool();
    const server = await createServer(loadConfig(PG_ENV), { createPool: () => pool });

    await server.close();

    await expect(pool.query('SELECT 1')).rejects.toThrow(/after calling end/);
  });
});

describe('createServer after a restart', () => {
  const LONG_AGO = new Date('2000-01-01T12:00:00.000Z');
  const FAR_AHEAD = new Date('2100-01-01T12:00:00.000Z');

  it('closes a round left open whose deadline passed while the server was down', async () => {
    const pool = await databaseWithRoundOpenedAt(LONG_AGO);

    app = await createServer(loadConfig(PG_ENV), { createPool: () => pool });

    await vi.waitFor(async () => {
      const stored = await new PgElectionRepository(pool).get('e1');
      expect(stored?.current.rounds).toMatchObject([{ status: 'CLOSED' }]);
    });
  });

  it('leaves no closing timer behind once the server closes', async () => {
    // Só os timers são falsos: o pg-mem e o Fastify seguem usando `setImmediate` de verdade.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pool = await databaseWithRoundOpenedAt(FAR_AHEAD);
    const server = await createServer(loadConfig(PG_ENV), { createPool: () => pool });

    await server.close();

    expect(vi.getTimerCount()).toBe(0);
  });
});
