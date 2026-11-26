import { describe, expect, it } from 'vitest';
import type { AdminRepository } from '../../src/ports';

const ANA = { id: 'admin-1', username: 'ana', passwordHash: 'hash-1' };
const BRUNO = { id: 'admin-2', username: 'bruno', passwordHash: 'hash-2' };

/** Fábrica de um repositório vazio; cada teste chama a sua, para não dividir estado. */
export type MakeAdminRepository = () => AdminRepository | Promise<AdminRepository>;

/**
 * Suíte de contrato: o comportamento que toda implementação de `AdminRepository`
 * (memória, Postgres) precisa ter. Cada implementação a chama no seu próprio arquivo de teste.
 *
 * @param name - Nome da implementação, usado no `describe`.
 * @param makeRepo - Cria um repositório vazio.
 */
export function describeAdminRepositoryContract(name: string, makeRepo: MakeAdminRepository): void {
  describe(`${name} (AdminRepository contract)`, () => {
    it('finds a created admin by username', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);

      const found = await repo.findByUsername('ana');

      expect(found).toEqual(ANA);
    });

    it('finds a created admin by id', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);
      await repo.create(BRUNO);

      const found = await repo.findById('admin-2');

      expect(found).toEqual(BRUNO);
    });

    it('returns null for an unknown username', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);

      expect(await repo.findByUsername('carla')).toBeNull();
    });

    it('returns null for an unknown id', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);

      expect(await repo.findById('admin-9')).toBeNull();
    });

    it('rejects a second admin with the same username', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);

      const duplicate = repo.create({ ...BRUNO, username: 'ana' });

      await expect(duplicate).rejects.toThrow(/username/);
    });

    it('rejects a second admin with the same id', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);

      const duplicate = repo.create({ ...BRUNO, id: 'admin-1' });

      await expect(duplicate).rejects.toThrow(/id/);
    });

    it('is not affected by changes made to the returned admin', async () => {
      const repo = await makeRepo();
      await repo.create(ANA);
      const found = await repo.findByUsername('ana');
      (found as { passwordHash: string }).passwordHash = 'tampered';

      const again = await repo.findByUsername('ana');

      expect(again?.passwordHash).toBe('hash-1');
    });
  });
}
