import { describe, expect, it } from 'vitest';
import { PgAdminRepository } from '../../../src/adapters/pg/pg-admin-repository';
import { describeAdminRepositoryContract } from '../../contracts/admin-repository.contract';
import { createMigratedPgMemPool } from '../../doubles/pg-mem-pool';

describeAdminRepositoryContract(
  'PgAdminRepository',
  async () => new PgAdminRepository(await createMigratedPgMemPool()),
);

describe('PgAdminRepository', () => {
  it('keeps admins for a new repository on the same database', async () => {
    const pool = await createMigratedPgMemPool();
    const ana = { id: 'admin-1', username: 'ana', passwordHash: 'hash-1' };
    await new PgAdminRepository(pool).create(ana);

    const found = await new PgAdminRepository(pool).findByUsername('ana');

    expect(found).toEqual(ana);
  });
});
