import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { type IBackup, newDb } from 'pg-mem';
import { migrate } from '../../src/adapters/pg/migrate';
import type { DatabasePool, SqlPool } from '../../src/adapters/pg/sql';

/**
 * Postgres em memória (`pg-mem`) para testar os adaptadores SQL sem Docker nem rede. Cada
 * chamada cria um banco vazio e isolado.
 *
 * O adaptador `pg` do `pg-mem` ignora `ROLLBACK`, então este pool o emula com os pontos de
 * restauração do banco. Isso só vale para uma transação de cada vez, que é o que os testes
 * fazem; por isso um comando enviado direto ao pool com uma transação aberta é recusado.
 *
 * @returns Um pool ligado ao banco novo.
 */
export function createPgMemPool(): SqlPool {
  // Sem `noAstCoverageCheck`, o pg-mem falha ao repetir um `CREATE TABLE IF NOT EXISTS`
  // (limitação dele: o Postgres real aceita).
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool: MemoryPool } = db.adapters.createPg() as { Pool: typeof Pool };
  // O tipo é o do `pg` de verdade, então o typecheck garante que ele cabe na nossa interface.
  const pool: SqlPool = new MemoryPool();
  /** Estado do banco no `BEGIN` da transação aberta; ausente se não houver transação. */
  let restorePoint: IBackup | undefined;

  return {
    query: (text, values) =>
      restorePoint
        ? Promise.reject(new Error(`Statement sent outside the open transaction: ${text}`))
        : pool.query(text, values),
    connect: async () => {
      const connection = await pool.connect();
      return {
        query: (text, values) => {
          if (text === 'BEGIN') restorePoint = db.backup();
          if (text === 'ROLLBACK') restorePoint?.restore();
          if (text === 'COMMIT' || text === 'ROLLBACK') restorePoint = undefined;
          return connection.query(text, values);
        },
        release: (destroy) => connection.release(destroy),
      };
    },
  };
}

/**
 * Cria um banco em memória já com as tabelas do servidor.
 *
 * @returns O pool do banco migrado.
 */
export async function createMigratedPgMemPool(): Promise<SqlPool> {
  const pool = createPgMemPool();
  await migrate(pool);
  return pool;
}

/** Pool em memória com o que a composição usa do `pg.Pool`: evento `error` e `end`. */
export interface PgMemDatabasePool extends DatabasePool {
  /**
   * Simula a queda de uma conexão ociosa, que o `pg.Pool` avisa com o evento `error`.
   *
   * @param event - Sempre `error`.
   * @param error - Erro entregue aos ouvintes.
   * @returns `true` se havia ouvinte.
   * @throws {Error} O próprio `error`, se ninguém ouve (como no `pg.Pool`, derruba o processo).
   */
  emit(event: 'error', error: Error): boolean;
}

// Mesma mensagem do `pg.Pool` depois do `end`.
const POOL_ENDED_MESSAGE = 'Cannot use a pool after calling end on the pool';

/**
 * Cria um banco em memória vazio com um pool que se comporta como o `pg.Pool` no que a
 * composição usa: avisa falhas de conexão pelo evento `error` e recusa uso depois do `end`.
 *
 * @returns O pool do banco novo (sem tabelas).
 */
export function createPgMemDatabasePool(): PgMemDatabasePool {
  const pool = createPgMemPool();
  const events = new EventEmitter();
  let ended = false;
  const refuseAfterEnd = () => Promise.reject(new Error(POOL_ENDED_MESSAGE));

  return {
    query: (text, values) => (ended ? refuseAfterEnd() : pool.query(text, values)),
    connect: () => (ended ? refuseAfterEnd() : pool.connect()),
    on: (event, listener) => events.on(event, listener),
    emit: (event, error) => events.emit(event, error),
    end: async () => {
      ended = true;
    },
  };
}
