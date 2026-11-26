import { describe, expect, it } from 'vitest';
import { PgElectionRepository } from '../../../src/adapters/pg/pg-election-repository';
import { describeElectionRepositoryContract } from '../../contracts/election-repository.contract';
import { createMigratedPgMemPool } from '../../doubles/pg-mem-pool';
import { anElectionRecord } from '../../support/election-records';

describeElectionRepositoryContract(
  'PgElectionRepository',
  async () => new PgElectionRepository(await createMigratedPgMemPool()),
);

describe('PgElectionRepository', () => {
  it('keeps elections for a new repository on the same database', async () => {
    const pool = await createMigratedPgMemPool();
    const record = anElectionRecord({ id: 'election-1' });
    await new PgElectionRepository(pool).create(record);

    const found = await new PgElectionRepository(pool).get('election-1');

    expect(found).toEqual(record);
  });

  it('rejects creating an election with a voter code that another election owns', async () => {
    const repo = new PgElectionRepository(await createMigratedPgMemPool());
    await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));

    const second = repo.create(anElectionRecord({ id: 'election-2', voterCodes: ['AAAAAAAA'] }));

    await expect(second).rejects.toThrow(/duplicate key/);
  });

  it('stores nothing of an election rejected for a duplicate voter code', async () => {
    const repo = new PgElectionRepository(await createMigratedPgMemPool());
    await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));
    await expect(
      repo.create(anElectionRecord({ id: 'election-2', voterCodes: ['AAAAAAAA'] })),
    ).rejects.toThrow(/duplicate key/);

    const rejected = await repo.get('election-2');

    expect(rejected).toBeNull();
  });

  it('rejects a save that takes the voter code of another election', async () => {
    const repo = new PgElectionRepository(await createMigratedPgMemPool());
    await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));
    await repo.create(anElectionRecord({ id: 'election-2' }));

    const takeover = repo.save(
      anElectionRecord({ id: 'election-2', voterCodes: ['AAAAAAAA'], version: 1 }),
      0,
    );

    await expect(takeover).rejects.toThrow(/duplicate key/);
  });

  it('keeps the previous record when a save is rejected for a duplicate voter code', async () => {
    const repo = new PgElectionRepository(await createMigratedPgMemPool());
    const original = anElectionRecord({ id: 'election-2', voterCodes: ['BBBBBBBB'] });
    await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));
    await repo.create(original);
    await expect(
      repo.save(anElectionRecord({ id: 'election-2', voterCodes: ['AAAAAAAA'], version: 1 }), 0),
    ).rejects.toThrow(/duplicate key/);

    const found = await repo.get('election-2');

    expect(found).toEqual(original);
  });

  it('keeps the previous voter codes when a save is rejected for a duplicate voter code', async () => {
    const repo = new PgElectionRepository(await createMigratedPgMemPool());
    await repo.create(anElectionRecord({ id: 'election-1', voterCodes: ['AAAAAAAA'] }));
    await repo.create(anElectionRecord({ id: 'election-2', voterCodes: ['BBBBBBBB'] }));
    await expect(
      repo.save(anElectionRecord({ id: 'election-2', voterCodes: ['AAAAAAAA'], version: 1 }), 0),
    ).rejects.toThrow(/duplicate key/);

    const owner = await repo.findByVoterCode('BBBBBBBB');

    expect(owner).toEqual({ electionId: 'election-2', voterId: 'election-2:BBBBBBBB' });
  });
});
