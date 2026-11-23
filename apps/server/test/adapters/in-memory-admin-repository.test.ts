import { describe, expect, it } from 'vitest';
import { InMemoryAdminRepository } from '../../src/adapters/in-memory-admin-repository';

const ANA = { id: 'admin-1', username: 'ana', passwordHash: 'hash-1' };
const BRUNO = { id: 'admin-2', username: 'bruno', passwordHash: 'hash-2' };

describe('InMemoryAdminRepository', () => {
  it('finds a created admin by username', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);

    const found = await repo.findByUsername('ana');

    expect(found).toEqual(ANA);
  });

  it('finds a created admin by id', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);
    await repo.create(BRUNO);

    const found = await repo.findById('admin-2');

    expect(found).toEqual(BRUNO);
  });

  it('returns null for an unknown username', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);

    expect(await repo.findByUsername('carla')).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);

    expect(await repo.findById('admin-9')).toBeNull();
  });

  it('rejects a second admin with the same username', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);

    const duplicate = repo.create({ ...BRUNO, username: 'ana' });

    await expect(duplicate).rejects.toThrow(/username/);
  });

  it('rejects a second admin with the same id', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);

    const duplicate = repo.create({ ...BRUNO, id: 'admin-1' });

    await expect(duplicate).rejects.toThrow(/id/);
  });

  it('is not affected by changes made to the returned admin', async () => {
    const repo = new InMemoryAdminRepository();
    await repo.create(ANA);
    const found = await repo.findByUsername('ana');
    (found as { passwordHash: string }).passwordHash = 'tampered';

    const again = await repo.findByUsername('ana');

    expect(again?.passwordHash).toBe('hash-1');
  });
});
