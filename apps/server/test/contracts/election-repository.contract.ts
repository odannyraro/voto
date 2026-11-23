import { revokeVoter } from '@voto/domain';
import { describe, expect, it } from 'vitest';
import type { ElectionRepository } from '../../src/ports';
import { anElectionRecord, unwrap } from '../support/election-records';

/** Fábrica de um repositório vazio; cada teste chama a sua, para não dividir estado. */
export type MakeElectionRepository = () => ElectionRepository | Promise<ElectionRepository>;

/**
 * Suíte de contrato: o comportamento que toda implementação de `ElectionRepository`
 * (memória, Postgres) precisa ter. Cada implementação a chama no seu próprio arquivo de teste.
 *
 * @param name - Nome da implementação, usado no `describe`.
 * @param makeRepo - Cria um repositório vazio.
 */
export function describeElectionRepositoryContract(
  name: string,
  makeRepo: MakeElectionRepository,
): void {
  describe(`${name} (ElectionRepository contract)`, () => {
    describe('create and get', () => {
      it('returns the record that was created', async () => {
        const repo = await makeRepo();
        const record = anElectionRecord({ id: 'election-1' });
        await repo.create(record);

        const found = await repo.get('election-1');

        expect(found).toEqual(record);
      });

      it('returns null for an id that does not exist', async () => {
        const repo = await makeRepo();

        const found = await repo.get('missing');

        expect(found).toBeNull();
      });

      it('rejects creating a second election with the same id', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1' }));

        const second = repo.create(anElectionRecord({ id: 'election-1' }));

        await expect(second).rejects.toThrow(/already exists/);
      });

      it('is not affected by changes made to the object that was returned', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1' }));
        const returned = await repo.get('election-1');
        (returned?.current as { name: string }).name = 'Tampered';

        const again = await repo.get('election-1');

        expect(again?.current.name).toBe('Board election');
      });

      it('is not affected by changes made to the object that was passed in', async () => {
        const repo = await makeRepo();
        const record = anElectionRecord({ id: 'election-1' });
        await repo.create(record);
        (record.current as { name: string }).name = 'Tampered';

        const found = await repo.get('election-1');

        expect(found?.current.name).toBe('Board election');
      });
    });

    describe('save', () => {
      it('replaces the stored record when the expected version matches', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', version: 0 }));
        const next = anElectionRecord({ id: 'election-1', version: 1 });

        await repo.save(next, 0);

        expect(await repo.get('election-1')).toEqual(next);
      });

      it('rejects with VERSION_CONFLICT when the expected version is stale', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', version: 3 }));

        const stale = repo.save(anElectionRecord({ id: 'election-1', version: 4 }), 2);

        await expect(stale).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
      });

      it('rejects with VERSION_CONFLICT when the expected version is ahead of the stored one', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', version: 3 }));

        const ahead = repo.save(anElectionRecord({ id: 'election-1', version: 6 }), 5);

        await expect(ahead).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      });

      it('keeps the stored record when the save is rejected', async () => {
        const repo = await makeRepo();
        const original = anElectionRecord({ id: 'election-1', version: 3 });
        await repo.create(original);
        await Promise.allSettled([
          repo.save(anElectionRecord({ id: 'election-1', version: 4 }), 2),
        ]);

        const found = await repo.get('election-1');

        expect(found).toEqual(original);
      });

      it('rejects with ELECTION_NOT_FOUND when the election does not exist', async () => {
        const repo = await makeRepo();

        const missing = repo.save(anElectionRecord({ id: 'missing', version: 1 }), 0);

        await expect(missing).rejects.toMatchObject({ code: 'ELECTION_NOT_FOUND', status: 404 });
      });
    });

    describe('listing', () => {
      it('lists only the elections owned by the given admin', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'mine', adminId: 'admin-1' }));
        await repo.create(anElectionRecord({ id: 'theirs', adminId: 'admin-2' }));

        const mine = await repo.listByAdmin('admin-1');

        expect(mine.map((record) => record.current.id)).toEqual(['mine']);
      });

      it('lists nothing for an admin without elections', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'theirs', adminId: 'admin-2' }));

        const mine = await repo.listByAdmin('admin-1');

        expect(mine).toEqual([]);
      });

      it('lists every election regardless of owner', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'first', adminId: 'admin-1' }));
        await repo.create(anElectionRecord({ id: 'second', adminId: 'admin-2' }));

        const all = await repo.listAll();

        expect(all.map((record) => record.current.id).sort()).toEqual(['first', 'second']);
      });
    });

    describe('voter codes', () => {
      it('finds the election and voter that own a code', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));

        const owner = await repo.findByVoterCode('AAAAAAAA');

        expect(owner).toEqual({ electionId: 'election-1', voterId: 'election-1:AAAAAAAA' });
      });

      it('finds nothing for a code that nobody owns', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));

        const owner = await repo.findByVoterCode('BBBBBBBB');

        expect(owner).toBeNull();
      });

      it('finds codes of voters in different elections', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));
        await repo.create(anElectionRecord({ id: 'election-2', voterCodes: ['BBBBBBBB'] }));

        const owner = await repo.findByVoterCode('BBBBBBBB');

        expect(owner).toEqual({ electionId: 'election-2', voterId: 'election-2:BBBBBBBB' });
      });

      it('indexes codes of voters added by a later save', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1' }));
        await repo.save(
          anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'], version: 1 }),
          0,
        );

        const owner = await repo.findByVoterCode('AAAAAAAA');

        expect(owner).toEqual({ electionId: 'election-1', voterId: 'election-1:AAAAAAAA' });
      });

      it('forgets codes of voters that a later save no longer contains', async () => {
        // Desfazer um credenciamento devolve um estado sem esses eleitores.
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));
        await repo.save(anElectionRecord({ id: 'election-1', version: 1 }), 0);

        const owner = await repo.findByVoterCode('AAAAAAAA');

        expect(owner).toBeNull();
      });

      it('still finds the owner of a revoked code, so the caller can report it', async () => {
        const repo = await makeRepo();
        const record = anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] });
        const revoked = unwrap(revokeVoter(record.current, 'election-1:AAAAAAAA'));
        await repo.create({ current: revoked, past: [] });

        const owner = await repo.findByVoterCode('AAAAAAAA');

        expect(owner).toEqual({ electionId: 'election-1', voterId: 'election-1:AAAAAAAA' });
      });

      it('reports a code as taken when any election owns it', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));

        expect(await repo.isCodeTaken('AAAAAAAA')).toBe(true);
      });

      it('reports a code as free when no election owns it', async () => {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));

        expect(await repo.isCodeTaken('BBBBBBBB')).toBe(false);
      });
    });
  });
}
