import { describe, expect, it } from 'vitest';
import { migrate } from '../../../src/adapters/pg/migrate';
import { PgAdminRepository } from '../../../src/adapters/pg/pg-admin-repository';
import { createPgMemPool } from '../../doubles/pg-mem-pool';

const ANA = { id: 'admin-1', username: 'ana', passwordHash: 'hash-1' };

describe('migrate', () => {
  it.each(['admins', 'elections', 'voter_codes'])('creates the empty %s table', async (table) => {
    const pool = createPgMemPool();

    await migrate(pool);

    await expect(pool.query(`SELECT * FROM ${table}`)).resolves.toMatchObject({ rows: [] });
  });

  it('can run again on a migrated database without losing data', async () => {
    const pool = createPgMemPool();
    await migrate(pool);
    await new PgAdminRepository(pool).create(ANA);

    await migrate(pool);

    expect(await new PgAdminRepository(pool).findById('admin-1')).toEqual(ANA);
  });
});
