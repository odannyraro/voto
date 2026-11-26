import { describe, expect, it } from 'vitest';
import { inTransaction } from '../../../src/adapters/pg/transaction';
import { SpySqlPool } from '../../doubles/spy-sql-pool';

const WORK_FAILURE = new Error('work failed');

describe('inTransaction', () => {
  it('runs the work between BEGIN and COMMIT on one connection and releases it', async () => {
    const pool = new SpySqlPool();

    await inTransaction(pool, (tx) => tx.query('UPDATE something'));

    expect(pool.events).toEqual(['BEGIN', 'UPDATE something', 'COMMIT', 'release']);
  });

  it('returns what the work returns', async () => {
    const pool = new SpySqlPool();

    const result = await inTransaction(pool, () => Promise.resolve('done'));

    expect(result).toBe('done');
  });

  it('rolls back instead of committing when the work fails, and releases the connection', async () => {
    const pool = new SpySqlPool();

    await Promise.allSettled([inTransaction(pool, () => Promise.reject(WORK_FAILURE))]);

    expect(pool.events).toEqual(['BEGIN', 'ROLLBACK', 'release']);
  });

  it('rejects with the error of the work', async () => {
    const pool = new SpySqlPool();

    const outcome = inTransaction(pool, () => Promise.reject(WORK_FAILURE));

    await expect(outcome).rejects.toBe(WORK_FAILURE);
  });

  it('discards the connection when the rollback also fails', async () => {
    const pool = new SpySqlPool({ ROLLBACK: new Error('connection lost') });

    await Promise.allSettled([inTransaction(pool, () => Promise.reject(WORK_FAILURE))]);

    expect(pool.events).toEqual(['BEGIN', 'ROLLBACK', 'discard']);
  });

  it('keeps the error of the work when the rollback also fails', async () => {
    const pool = new SpySqlPool({ ROLLBACK: new Error('connection lost') });

    const outcome = inTransaction(pool, () => Promise.reject(WORK_FAILURE));

    await expect(outcome).rejects.toBe(WORK_FAILURE);
  });
});
