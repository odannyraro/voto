import { describe, expect, it } from 'vitest';
import { anElectionRecord } from '../support/election-records';
import { HeldSaveElectionRepository } from './held-save-election-repository';

/**
 * Cria o repositório com a eleição `e1` guardada na versão 0 e uma gravação da versão 1
 * segurada, já parada no repositório.
 *
 * @returns O repositório, o controle e a promessa da gravação segurada.
 */
async function repositoryHoldingASave() {
  const repository = new HeldSaveElectionRepository();
  await repository.create(anElectionRecord({ id: 'e1' }));
  const held = repository.holdNextSave();
  const save = repository.save(anElectionRecord({ id: 'e1', version: 1 }), 0);
  await held.reached;
  return { repository, held, save };
}

describe('HeldSaveElectionRepository', () => {
  it('stores nothing while the save is held', async () => {
    const { repository } = await repositoryHoldingASave();

    const stored = await repository.get('e1');

    expect(stored?.current.version).toBe(0);
  });

  it('stores the held save once it is released', async () => {
    const { repository, held, save } = await repositoryHoldingASave();

    held.release();
    await save;

    expect((await repository.get('e1'))?.current.version).toBe(1);
  });

  it('fails the held save with the given error', async () => {
    const { held, save } = await repositoryHoldingASave();

    held.fail(new Error('database down'));

    await expect(save).rejects.toThrow('database down');
  });

  it('lets the other saves through while one is held', async () => {
    const { repository } = await repositoryHoldingASave();

    await repository.save(anElectionRecord({ id: 'e1', version: 7 }), 0);

    expect((await repository.get('e1'))?.current.version).toBe(7);
  });
});
