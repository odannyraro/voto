import { describe, expect, it } from 'vitest';
import { anElectionRecord } from '../support/election-records';
import { FailingSaveElectionRepository } from './failing-save-election-repository';

/**
 * Cria o repositório com a eleição `e1` guardada na versão 0.
 *
 * @returns O repositório, ainda sem falhas enfileiradas.
 */
async function repositoryWithElection(): Promise<FailingSaveElectionRepository> {
  const repository = new FailingSaveElectionRepository();
  await repository.create(anElectionRecord({ id: 'e1' }));
  return repository;
}

describe('FailingSaveElectionRepository', () => {
  it('fails the next saves with the queued errors, in order', async () => {
    const repository = await repositoryWithElection();
    repository.pendingFailures = [new Error('first'), new Error('second')];
    const save = () => repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0);

    await expect(save()).rejects.toThrow('first');
    await expect(save()).rejects.toThrow('second');
  });

  it('stores nothing when a save fails', async () => {
    const repository = await repositoryWithElection();
    repository.pendingFailures = [new Error('database down')];
    await expect(repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0)).rejects.toThrow(
      'database down',
    );

    const stored = await repository.get('e1');

    expect(stored?.current.version).toBe(0);
  });

  it('stores the save once the queued errors are used up', async () => {
    const repository = await repositoryWithElection();
    repository.pendingFailures = [new Error('database down')];
    await expect(repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0)).rejects.toThrow(
      'database down',
    );

    await repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0);

    expect((await repository.get('e1'))?.current.version).toBe(1);
  });

  it('runs the failure hook once for each failed save', async () => {
    const repository = await repositoryWithElection();
    let hookRuns = 0;
    repository.pendingFailures = [new Error('database down')];
    repository.onFailure = () => {
      hookRuns += 1;
    };
    await expect(repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0)).rejects.toThrow(
      'database down',
    );

    await repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0);

    expect(hookRuns).toBe(1);
  });
});
