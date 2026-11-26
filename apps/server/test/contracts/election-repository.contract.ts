import { pushSnapshot, revokeVoter } from '@voto/domain';
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

      it('returns the previous snapshots together with the current election', async () => {
        // O desfazer precisa sobreviver a um reinício, então o histórico é persistido junto.
        const repo = await makeRepo();
        const original = anElectionRecord({ id: 'election-1' });
        const renamed = pushSnapshot(original, {
          ...original.current,
          name: 'Renamed election',
          version: 1,
        });
        await repo.create(original);
        await repo.save(renamed, 0);

        const found = await repo.get('election-1');

        expect(found?.past).toEqual([original.current]);
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
        await expect(
          repo.save(anElectionRecord({ id: 'election-1', version: 4 }), 2),
        ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

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

    describe.each([
      ['listByAdmin', (repo: ElectionRepository) => repo.listByAdmin('admin-1')],
      ['listAll', (repo: ElectionRepository) => repo.listAll()],
    ])('order of %s', (_listing, list) => {
      /**
       * Cria um repositório com três eleições do mesmo admin, em uma ordem que não é a dos ids.
       *
       * @returns O repositório com `charlie`, `alpha` e `bravo`, criadas nessa ordem.
       */
      async function repositoryWithThreeElections(): Promise<ElectionRepository> {
        const repo = await makeRepo();
        await repo.create(anElectionRecord({ id: 'charlie' }));
        await repo.create(anElectionRecord({ id: 'alpha' }));
        await repo.create(anElectionRecord({ id: 'bravo' }));
        return repo;
      }

      it('is the order in which the elections were created', async () => {
        const repo = await repositoryWithThreeElections();

        const listed = await list(repo);

        expect(listed.map((record) => record.current.id)).toEqual(['charlie', 'alpha', 'bravo']);
      });

      it('does not change when an earlier election is saved again', async () => {
        const repo = await repositoryWithThreeElections();
        await repo.save(anElectionRecord({ id: 'charlie', version: 1 }), 0);

        const listed = await list(repo);

        expect(listed.map((record) => record.current.id)).toEqual(['charlie', 'alpha', 'bravo']);
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

      it('indexes the code of every voter of an election', async () => {
        const repo = await makeRepo();
        const voterCodes = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC'];
        await repo.create(anElectionRecord({ id: 'election-1', voterCodes }));

        const owner = await repo.findByVoterCode('CCCCCCCC');

        expect(owner).toEqual({ electionId: 'election-1', voterId: 'election-1:CCCCCCCC' });
      });

      it('keeps the indexed codes when a save is rejected', async () => {
        const repo = await makeRepo();
        await repo.create(
          anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'], version: 3 }),
        );
        await expect(
          repo.save(
            anElectionRecord({ id: 'election-1', voterCodes: ['BBBBBBBB'], version: 4 }),
            2,
          ),
        ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

        const taken = {
          kept: await repo.isCodeTaken('AAAAAAAA'),
          rejected: await repo.isCodeTaken('BBBBBBBB'),
        };

        expect(taken).toEqual({ kept: true, rejected: false });
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
