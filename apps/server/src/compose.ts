import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { createCryptoCodeGenerator } from './adapters/crypto-code-generator';
import { InMemoryAdminRepository } from './adapters/in-memory-admin-repository';
import { InMemoryElectionRepository } from './adapters/in-memory-election-repository';
import { migrate } from './adapters/pg/migrate';
import { PgAdminRepository } from './adapters/pg/pg-admin-repository';
import { PgElectionRepository } from './adapters/pg/pg-election-repository';
import type { DatabasePool } from './adapters/pg/sql';
import { SocketNotifier } from './adapters/socket-notifier';
import { systemClock } from './adapters/system-clock';
import { TimeoutScheduler } from './adapters/timeout-scheduler';
import { buildApp } from './app';
import type { Config } from './config';
import { registerStatic } from './http/static';
import type { AdminRepository, ElectionRepository } from './ports';
import { createRealtimeServer } from './realtime/gateway';
import { AuthService } from './services/auth';

/** Opções do pool do Postgres, no formato do `pg.Pool`. */
export interface DatabasePoolOptions {
  readonly connectionString: string;
  /** Tempo máximo (ms) de cada consulta antes de ela falhar. */
  readonly query_timeout: number;
}

/** O que dá para trocar na montagem do servidor; os testes trocam o banco pelo `pg-mem`. */
export interface ServerOptions {
  /** Cria o pool do Postgres (padrão: `new Pool(options)` do `pg`). */
  readonly createPool?: (options: DatabasePoolOptions) => DatabasePool;
}

/** Repositórios escolhidos pela configuração. */
interface Repositories {
  readonly electionRepository: ElectionRepository;
  readonly adminRepository: AdminRepository;
}

/**
 * Limite de cada consulta ao banco. As gravações de uma eleição esperam a vez numa fila (B17b),
 * então uma consulta travada seguraria todas as seguintes da mesma eleição.
 */
const DATABASE_QUERY_TIMEOUT_MS = 10_000;

/**
 * Cria o pool de produção do `pg`.
 *
 * @param options - Endereço do banco e limite de tempo das consultas.
 * @returns O pool, que só conecta na primeira consulta.
 */
function createPgPool(options: DatabasePoolOptions): DatabasePool {
  return new Pool(options);
}

/**
 * Monta o servidor real a partir da configuração: repositórios (memória ou Postgres, já
 * migrado), relógio, agendador, gerador de códigos e tempo real de produção, o admin inicial e,
 * se houver build do front, os arquivos estáticos. Ao ficar pronto, o app reagenda as rodadas
 * que ficaram abertas (§8.3). Fechar o app cancela os timers e encerra o pool do banco.
 *
 * @param config - Configuração validada por `loadConfig`.
 * @param options - Troca da fábrica do pool (só os testes usam).
 * @returns O app já pronto, faltando apenas o `listen`.
 * @throws {Error} Se o banco estiver inacessível na migração ou na leitura das rodadas abertas.
 */
export async function createServer(
  config: Config,
  options: ServerOptions = {},
): Promise<FastifyInstance> {
  const pool = openDatabasePool(config, options.createPool ?? createPgPool);
  const repositories = pool ? pgRepositories(pool) : memoryRepositories();
  const scheduler = new TimeoutScheduler();
  const io = createRealtimeServer();
  const app = buildApp({
    config,
    clock: systemClock,
    scheduler,
    notifier: new SocketNotifier(io),
    codeGenerator: createCryptoCodeGenerator(),
    newId: randomUUID,
    ...repositories,
    realtime: io,
  });
  app.addHook('onClose', async () => {
    scheduler.cancelAll();
    await pool?.end();
  });

  if (pool) {
    // Sem ouvinte, a queda de uma conexão ociosa (comum no Neon) derrubaria o processo.
    pool.on('error', (err) => app.log.error({ err }, 'Idle database connection failed'));
    await migrate(pool);
  }
  await seedAdmin(config, repositories.adminRepository);
  if (config.webDistDir) registerStatic(app, resolve(config.webDistDir));
  await app.ready();
  return app;
}

/**
 * Abre o pool do Postgres quando a configuração pede esse repositório. A escolha é pelo
 * `REPOSITORY`, não pela presença do `DATABASE_URL`, que pode sobrar num `.env` de dev.
 *
 * @param config - Configuração validada.
 * @param createPool - Fábrica do pool.
 * @returns O pool com limite de tempo por consulta, ou `undefined` no repositório em memória.
 * @throws {Error} Se o repositório for `pg` e faltar o endereço do banco.
 */
function openDatabasePool(
  config: Config,
  createPool: (options: DatabasePoolOptions) => DatabasePool,
): DatabasePool | undefined {
  if (config.repository !== 'pg') return undefined;
  if (config.databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required when REPOSITORY is pg');
  }
  return createPool({
    connectionString: config.databaseUrl,
    query_timeout: DATABASE_QUERY_TIMEOUT_MS,
  });
}

/**
 * Repositórios do Postgres sobre o mesmo pool.
 *
 * @param pool - Pool do banco.
 * @returns Os repositórios de eleições e de admins.
 */
function pgRepositories(pool: DatabasePool): Repositories {
  return {
    electionRepository: new PgElectionRepository(pool),
    adminRepository: new PgAdminRepository(pool),
  };
}

/**
 * Repositórios em memória (dev e e2e): o estado some quando o processo termina.
 *
 * @returns Os repositórios de eleições e de admins, vazios.
 */
function memoryRepositories(): Repositories {
  return {
    electionRepository: new InMemoryElectionRepository(),
    adminRepository: new InMemoryAdminRepository(),
  };
}

/**
 * Cria o admin inicial a partir do ambiente (§8.4), se as credenciais vierem. Se o usuário já
 * existe (reinício com banco), mantém a senha guardada.
 *
 * @param config - Configuração com usuário, senha e custo do bcrypt.
 * @param adminRepository - Onde o admin é guardado.
 */
async function seedAdmin(config: Config, adminRepository: AdminRepository): Promise<void> {
  const { adminUsername, adminPassword } = config;
  if (adminUsername === undefined || adminPassword === undefined) return;
  const auth = new AuthService({
    adminRepository,
    clock: systemClock,
    jwtSecret: config.jwtSecret,
    bcryptRounds: config.bcryptRounds,
    newId: randomUUID,
  });
  await auth.seedAdmin(adminUsername, adminPassword);
}
