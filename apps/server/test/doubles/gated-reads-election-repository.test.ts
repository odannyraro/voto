import { describe, expect, it, vi } from 'vitest';
import { anElectionRecord } from '../support/election-records';
import { GatedReadsElectionRepository } from './gated-reads-election-repository';

/**
 * Cria o repositório com a eleição `e1` guardada.
 *
 * @returns O repositório, sem nenhuma leitura segurada.
 */
async function repositoryWithElection() {
  const repository = new GatedReadsElectionRepository();
  await repository.create(anElectionRecord({ id: 'e1' }));
  return repository;
}

/**
 * Deixa o event loop esvaziar as promessas pendentes, sem esperar tempo nenhum.
 *
 * @returns Promessa resolvida na próxima volta do event loop.
 */
function pendingPromisesSettled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('GatedReadsElectionRepository', () => {
  it('holds a read while the others have not arrived', async () => {
    const repository = await repositoryWithElection();
    const delivered = vi.fn();
    repository.holdNextReads(2);

    void repository.get('e1').then(delivered);
    await pendingPromisesSettled();

    expect(delivered).not.toHaveBeenCalled();
  });

  it('delivers every held read once the last one arrives', async () => {
    const repository = await repositoryWithElection();
    repository.holdNextReads(2);

    const records = await Promise.all([repository.get('e1'), repository.get('e1')]);

    expect(records).toMatchObject([{ current: { id: 'e1' } }, { current: { id: 'e1' } }]);
  });

  it('lets the reads after the held ones through', async () => {
    const repository = await repositoryWithElection();
    repository.holdNextReads(2);
    await Promise.all([repository.get('e1'), repository.get('e1')]);

    const later = await repository.get('e1');

    expect(later).toMatchObject({ current: { id: 'e1' } });
  });
});
