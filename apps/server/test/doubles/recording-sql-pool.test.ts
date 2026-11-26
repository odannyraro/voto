import { describe, expect, it } from 'vitest';
import { createPgMemPool } from './pg-mem-pool';
import { RecordingSqlPool } from './recording-sql-pool';

describe('RecordingSqlPool', () => {
  it('runs the statements on the wrapped pool', async () => {
    const pool = new RecordingSqlPool(createPgMemPool());

    const result = await pool.query('SELECT $1::int AS answer', [42]);

    expect(result.rows).toEqual([{ answer: 42 }]);
  });

  it('records the statements sent to the pool and to its connections, in order', async () => {
    const pool = new RecordingSqlPool(createPgMemPool());
    await pool.query('CREATE TABLE notes (body TEXT)');
    const connection = await pool.connect();

    await connection.query('INSERT INTO notes (body) VALUES ($1)', ['draft']);
    connection.release();

    expect(pool.statements).toEqual([
      'CREATE TABLE notes (body TEXT)',
      'INSERT INTO notes (body) VALUES ($1)',
    ]);
  });
});
