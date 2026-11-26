import { describe, expect, it } from 'vitest';
import { createPgMemDatabasePool, createPgMemPool } from './pg-mem-pool';

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

describe('createPgMemDatabasePool', () => {
  it('runs statements like the plain pool', async () => {
    const pool = createPgMemDatabasePool();

    const result = await pool.query('SELECT 1 AS one');

    expect(result.rows).toEqual([{ one: 1 }]);
  });

  it('refuses statements after the pool is ended, like the real pg pool', async () => {
    const pool = createPgMemDatabasePool();
    await pool.end();

    const afterEnd = pool.query('SELECT 1');

    await expect(afterEnd).rejects.toThrow(/after calling end/);
  });

  it('refuses new connections after the pool is ended', async () => {
    const pool = createPgMemDatabasePool();
    await pool.end();

    const afterEnd = pool.connect();

    await expect(afterEnd).rejects.toThrow(/after calling end/);
  });

  it('hands an emitted connection error to the registered listener', () => {
    const pool = createPgMemDatabasePool();
    const received: Error[] = [];
    pool.on('error', (error) => received.push(error));

    pool.emit('error', new Error('Connection terminated unexpectedly'));

    expect(received).toEqual([new Error('Connection terminated unexpectedly')]);
  });

  it('crashes on an emitted connection error nobody listens to, like the real pg pool', () => {
    const pool = createPgMemDatabasePool();

    const emitting = () => pool.emit('error', new Error('Connection terminated unexpectedly'));

    expect(emitting).toThrow('Connection terminated unexpectedly');
  });
});
