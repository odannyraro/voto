import { describe, expect, it } from 'vitest';
import { SpySqlPool } from './spy-sql-pool';

describe('SpySqlPool', () => {
  it('records the statements and the release of a connection in order', async () => {
    const pool = new SpySqlPool();
    const connection = await pool.connect();

    await connection.query('BEGIN');
    await connection.query('COMMIT');
    connection.release();

    expect(pool.events).toEqual(['BEGIN', 'COMMIT', 'release']);
  });

  it('records a connection that is released to be destroyed as discarded', async () => {
    const pool = new SpySqlPool();
    const connection = await pool.connect();

    connection.release(true);

    expect(pool.events).toEqual(['discard']);
  });

  it('records statements run outside a connection with a pool prefix', async () => {
    const pool = new SpySqlPool();

    await pool.query('SELECT 1');

    expect(pool.events).toEqual(['pool: SELECT 1']);
  });

  it('rejects a statement configured to fail, after recording it', async () => {
    const failure = new Error('connection lost');
    const pool = new SpySqlPool({ COMMIT: failure });
    const connection = await pool.connect();

    const commit = connection.query('COMMIT');

    await expect(commit).rejects.toBe(failure);
    expect(pool.events).toEqual(['COMMIT']);
  });
});
