import { describe, expect, it } from 'vitest';
import { createPgMemPool } from './pg-mem-pool';

/**
 * Cria um banco com uma tabela vazia, insere uma linha numa transação e a encerra.
 *
 * @param ending - Comando que encerra a transação.
 * @returns As linhas que sobraram na tabela.
 */
async function rowsAfterTransaction(ending: 'COMMIT' | 'ROLLBACK'): Promise<unknown[]> {
  const pool = createPgMemPool();
  await pool.query('CREATE TABLE notes (body TEXT)');
  const connection = await pool.connect();
  await connection.query('BEGIN');
  await connection.query('INSERT INTO notes (body) VALUES ($1)', ['draft']);
  await connection.query(ending);
  connection.release();
  return (await pool.query('SELECT body FROM notes')).rows;
}

describe('createPgMemPool', () => {
  it('undoes the writes of a transaction that rolls back', async () => {
    const rows = await rowsAfterTransaction('ROLLBACK');

    expect(rows).toEqual([]);
  });

  it('keeps the writes of a transaction that commits', async () => {
    const rows = await rowsAfterTransaction('COMMIT');

    expect(rows).toEqual([{ body: 'draft' }]);
  });

  it('rejects a statement sent to the pool while a transaction is open', async () => {
    // No Postgres real esse comando iria por outra conexão e escaparia do rollback.
    const pool = createPgMemPool();
    const connection = await pool.connect();
    await connection.query('BEGIN');

    const outside = pool.query('SELECT 1');

    await expect(outside).rejects.toThrow(/outside the open transaction/);
  });
});
