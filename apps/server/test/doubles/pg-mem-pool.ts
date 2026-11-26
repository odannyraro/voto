import type { Pool } from 'pg';
import { type IBackup, newDb } from 'pg-mem';
import { migrate } from '../../src/adapters/pg/migrate';
import type { SqlPool } from '../../src/adapters/pg/sql';

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
