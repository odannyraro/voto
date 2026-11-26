import { describe, expect, it } from 'vitest';
import { ElectionService } from '../../src/services/election-service';
import { FakeClock } from '../doubles/fake-clock';
import { FakeScheduler } from '../doubles/fake-scheduler';
import { HeldSaveElectionRepository } from '../doubles/held-save-election-repository';
import { SpyLogger } from '../doubles/spy-logger';
import { SpyNotifier } from '../doubles/spy-notifier';
import { StubCodeGenerator } from '../doubles/stub-code-generator';
import { openElectionWithVoters } from '../support/election-fixtures';
import { flushPendingWork } from '../support/pending-work';

const START = new Date('2026-01-01T12:00:00.000Z');
const OWNER = 'admin-1';
const VOTE_GRACE_MS = 1000;
// Rodada de 60 s (padrão da eleição): instantes contados a partir da abertura.
const INSIDE_THE_GRACE_MS = 60_500;
const FROM_INSIDE_TO_PAST_THE_GRACE_MS = 501;
const PAST_THE_GRACE_MS = 61_001;
// A primeira rodada aberta pelo serviço recebe o primeiro id gerado.
const VOTE = { roundId: 'id-1', choice: 'president-candidate' };
const FIRST_VOTER = 'e1:VOTERAAA';

/**
 * Serviço com a eleição `e1` do dono e a rodada de `president` aberta pelo admin (versão 1,
 * um passo desfazível), num repositório que sabe segurar gravações.
 *
 * @param voterCodes - Códigos dos eleitores credenciados.
 * @returns O serviço e os doubles.
 */
async function serviceWithOpenRound(voterCodes: readonly string[] = ['VOTERAAA', 'VOTERBBB']) {
  const repository = new HeldSaveElectionRepository();
  const clock = new FakeClock(START);
  const logger = new SpyLogger();
  let nextId = 0;
  const service = new ElectionService({
    electionRepository: repository,
    clock,
    scheduler: new FakeScheduler(),
    notifier: new SpyNotifier(),
    logger,
    codeGenerator: new StubCodeGenerator(['NEWVOTER']),
    newId: () => `id-${++nextId}`,
    voteGraceMs: VOTE_GRACE_MS,
    historyLimit: 50,
  });
  await repository.create(
    openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'], voterCodes }),
  );
  await service.openRound(OWNER, 'e1', { positionId: 'president' });
  return { service, repository, clock, logger };
}

/**
 * Deixa um comando do admin parado no meio da gravação, ocupando a vez da eleição.
 *
 * @param test - Serviço com a rodada aberta.
 * @returns O controle da gravação e a promessa do comando.
 */
async function adminWriteInProgress(test: Awaited<ReturnType<typeof serviceWithOpenRound>>) {
  const held = test.repository.holdNextSave();
  const write = test.service.updateElection(OWNER, 'e1', { name: 'Annual vote' });
  await held.reached;
  return { held, write };
}

describe('ElectionService writes of the same election', () => {
  it('accepts and counts 100 simultaneous votes', async () => {
    const voterCodes = Array.from({ length: 100 }, (_, index) => `VOTER-${index}`);
    const { service, repository } = await serviceWithOpenRound(voterCodes);

    const votes = Promise.all(voterCodes.map((code) => service.castVote(`e1:${code}`, 'e1', VOTE)));

    await expect(votes).resolves.toHaveLength(100);
    expect((await repository.get('e1'))?.current.rounds[0]?.tally).toEqual({
      'president-candidate': 100,
    });
  });

  it.each([
    [
      'an admin command',
      (service: ElectionService) => service.updateElection(OWNER, 'e1', { name: 'Annual vote' }),
    ],
    [
      'credentialing a voter',
      (service: ElectionService) => service.credentialVoters(OWNER, 'e1', { count: 1 }),
    ],
    ['an undo', (service: ElectionService) => service.undo(OWNER, 'e1')],
  ])('saves both a vote and %s sent at the same time', async (_name, adminWrite) => {
    const { service } = await serviceWithOpenRound();

    const both = Promise.all([service.castVote(FIRST_VOTER, 'e1', VOTE), adminWrite(service)]);

    await expect(both).resolves.toHaveLength(2);
  });

  it.each([
    ['the timer', (service: ElectionService) => service.handleDeadline('e1')],
    ['an admin read', (service: ElectionService) => service.getElection(OWNER, 'e1')],
    ['a voter read', (service: ElectionService) => service.settleDueRound('e1')],
  ])(
    'counts a tolerated vote waiting for its turn before %s closes the round',
    async (_name, close) => {
      const test = await serviceWithOpenRound();
      const { held, write } = await adminWriteInProgress(test);
      test.clock.advance(INSIDE_THE_GRACE_MS);
      const vote = test.service.castVote(FIRST_VOTER, 'e1', VOTE);
      test.clock.advance(FROM_INSIDE_TO_PAST_THE_GRACE_MS);
      const closing = close(test.service);
      await flushPendingWork();

      held.release();

      await Promise.all([write, vote, closing]);
      expect((await test.repository.get('e1'))?.current.rounds).toMatchObject([
        { status: 'CLOSED', votedVoterIds: [FIRST_VOTER] },
      ]);
    },
  );

  it.each([
    [
      'an admin command',
      (service: ElectionService) => service.updateElection(OWNER, 'e1', { name: 'Second name' }),
    ],
    [
      'credentialing a voter',
      (service: ElectionService) => service.credentialVoters(OWNER, 'e1', { count: 1 }),
    ],
  ])(
    'does not let %s that arrived within the grace cut off a tolerated vote behind it',
    async (_name, adminWrite) => {
      const test = await serviceWithOpenRound();
      const { held, write } = await adminWriteInProgress(test);
      test.clock.advance(INSIDE_THE_GRACE_MS);
      const waiting = adminWrite(test.service);
      const vote = test.service.castVote(FIRST_VOTER, 'e1', VOTE);
      await flushPendingWork();
      // A vez dos dois só chega depois de a tolerância acabar.
      test.clock.advance(FROM_INSIDE_TO_PAST_THE_GRACE_MS);

      held.release();

      await Promise.all([write, waiting, vote]);
      expect((await test.repository.get('e1'))?.current.rounds[0]?.votedVoterIds).toEqual([
        FIRST_VOTER,
      ]);
    },
  );

  it('judges a vote by when it arrived, even if its turn comes after the deadline', async () => {
    const test = await serviceWithOpenRound();
    const { held, write } = await adminWriteInProgress(test);
    const vote = test.service.castVote(FIRST_VOTER, 'e1', VOTE);
    await flushPendingWork();
    test.clock.advance(PAST_THE_GRACE_MS);

    held.release();

    await Promise.all([write, vote]);
    expect((await test.repository.get('e1'))?.current.rounds[0]?.votedVoterIds).toEqual([
      FIRST_VOTER,
    ]);
  });

  it.each([
    ['the admin', (service: ElectionService) => service.getElection(OWNER, 'e1')],
    ['a voter', (service: ElectionService) => service.settleDueRound('e1')],
  ])(
    'answers a read by %s with nothing to close without waiting for the write in progress',
    async (_name, read) => {
      const test = await serviceWithOpenRound();
      const { held, write } = await adminWriteInProgress(test);

      const record = await read(test.service);

      expect(record?.current.version).toBe(1);
      held.release();
      await write;
    },
  );

  it('does not make an election wait for a write in progress in another one', async () => {
    const test = await serviceWithOpenRound();
    await test.repository.create(
      openElectionWithVoters({ id: 'e2', adminId: OWNER, positionIds: ['mayor'], voterCodes: [] }),
    );
    const { held, write } = await adminWriteInProgress(test);

    const other = await test.service.updateElection(OWNER, 'e2', { name: 'Other vote' });

    expect(other.current.name).toBe('Other vote');
    held.release();
    await write;
  });

  it('keeps saving after a write fails', async () => {
    const test = await serviceWithOpenRound();
    const { held, write } = await adminWriteInProgress(test);
    const vote = test.service.castVote(FIRST_VOTER, 'e1', VOTE);
    await flushPendingWork();

    held.fail(new Error('database down'));

    await Promise.all([expect(write).rejects.toThrow('database down'), vote]);
    expect((await test.repository.get('e1'))?.current.rounds[0]?.votedVoterIds).toEqual([
      FIRST_VOTER,
    ]);
  });

  // Rede de segurança: nada além do próprio serviço deveria gravar, mas se gravar, ele relê.
  it.each([
    ['a vote', 0, (service: ElectionService) => service.castVote(FIRST_VOTER, 'e1', VOTE)],
    [
      'an admin read',
      PAST_THE_GRACE_MS,
      (service: ElectionService) => service.getElection(OWNER, 'e1'),
    ],
    ['a voter read', PAST_THE_GRACE_MS, (service: ElectionService) => service.settleDueRound('e1')],
  ])('rereads the election when %s loses to a save made outside it', async (_name, wait, act) => {
    const test = await serviceWithOpenRound();
    test.clock.advance(wait);
    const held = test.repository.holdNextSave();
    const operation = act(test.service);
    await held.reached;
    const seen = (await test.repository.get('e1')) ?? expect.fail('election e1 is missing');
    await test.repository.save({ ...seen, current: { ...seen.current, version: 2 } }, 1);

    held.release();

    await expect(operation).resolves.toMatchObject({ current: { version: 3 } });
  });
});
