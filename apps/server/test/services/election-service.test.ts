import { describe, expect, it } from 'vitest';
import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import { ElectionService } from '../../src/services/election-service';
import { FakeClock } from '../doubles/fake-clock';
import { FakeScheduler } from '../doubles/fake-scheduler';
import { SpyNotifier } from '../doubles/spy-notifier';
import { anElectionRecord } from '../support/election-records';
import { openElectionWithVoters } from '../support/election-fixtures';

const START = new Date('2026-01-01T12:00:00.000Z');
const VOTE_GRACE_MS = 1000;
const HISTORY_LIMIT = 50;
const OWNER = 'admin-1';
const ONE_MINUTE_SECONDS = 60;
const ONE_MINUTE_AND_ONE_SECOND_MS = 61_000;

/**
 * Cria o serviço com o domínio real, repositório em memória e doubles nas fronteiras.
 *
 * @param options - Limite do histórico, quando o teste é sobre ele.
 * @returns O serviço e os doubles, para o teste montar o cenário e inspecionar o efeito.
 */
function makeService(options: { historyLimit?: number } = {}) {
  const repository = new InMemoryElectionRepository();
  const clock = new FakeClock(START);
  const scheduler = new FakeScheduler();
  const notifier = new SpyNotifier();
  let nextId = 0;
  const service = new ElectionService({
    electionRepository: repository,
    clock,
    scheduler,
    notifier,
    newId: () => `id-${++nextId}`,
    voteGraceMs: VOTE_GRACE_MS,
    historyLimit: options.historyLimit ?? HISTORY_LIMIT,
  });
  return { service, repository, clock, scheduler, notifier };
}

describe('ElectionService command flow', () => {
  describe('authorization', () => {
    it('rejects a command on an election that does not exist with 404', async () => {
      const { service } = makeService();

      const command = service.addPosition(OWNER, 'missing', {
        title: 'President',
        tiebreak: 'YOUNGEST',
      });

      await expect(command).rejects.toMatchObject({ status: 404, code: 'ELECTION_NOT_FOUND' });
    });

    it("rejects a command on another admin's election with 403", async () => {
      const { service, repository } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: 'admin-1' }));

      const command = service.addPosition('admin-2', 'e1', {
        title: 'President',
        tiebreak: 'YOUNGEST',
      });

      await expect(command).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });
  });

  describe('when the domain rejects the command', () => {
    it('propagates the domain error', async () => {
      const { service, repository } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

      const command = service.addPosition(OWNER, 'e1', { title: '   ', tiebreak: 'YOUNGEST' });

      await expect(command).rejects.toMatchObject({
        name: 'DomainError',
        code: 'INVALID_POSITION_TITLE',
      });
    });

    it('saves nothing', async () => {
      const { service, repository } = makeService();
      const stored = anElectionRecord({ id: 'e1', adminId: OWNER });
      await repository.create(stored);

      await expect(
        service.addPosition(OWNER, 'e1', { title: '   ', tiebreak: 'YOUNGEST' }),
      ).rejects.toThrow();

      expect(await repository.get('e1')).toEqual(stored);
    });

    it('notifies nobody', async () => {
      const { service, repository, notifier } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

      await expect(
        service.addPosition(OWNER, 'e1', { title: '   ', tiebreak: 'YOUNGEST' }),
      ).rejects.toThrow();

      expect(notifier.adminStates).toEqual([]);
    });
  });

  describe('when the command succeeds', () => {
    it('saves the new state with the version incremented', async () => {
      const { service, repository } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER, version: 3 }));

      await service.addPosition(OWNER, 'e1', { title: 'President', tiebreak: 'YOUNGEST' });

      expect((await repository.get('e1'))?.current).toMatchObject({
        version: 4,
        positions: [{ title: 'President' }],
      });
    });

    it('returns the saved record', async () => {
      const { service, repository } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

      const record = await service.addPosition(OWNER, 'e1', {
        title: 'President',
        tiebreak: 'YOUNGEST',
      });

      expect(record).toEqual(await repository.get('e1'));
    });

    it('pushes the previous state onto the undo history', async () => {
      const { service, repository } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

      await service.addPosition(OWNER, 'e1', { title: 'President', tiebreak: 'YOUNGEST' });

      expect((await repository.get('e1'))?.past).toMatchObject([{ version: 0, positions: [] }]);
    });

    it('keeps only the configured number of previous states', async () => {
      const { service, repository } = makeService({ historyLimit: 1 });
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));
      await service.addPosition(OWNER, 'e1', { title: 'President', tiebreak: 'YOUNGEST' });

      await service.addPosition(OWNER, 'e1', { title: 'Treasurer', tiebreak: 'YOUNGEST' });

      expect((await repository.get('e1'))?.past).toMatchObject([
        { positions: [{ title: 'President' }] },
      ]);
    });

    it('notifies the admin with the new state', async () => {
      const { service, repository, notifier } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

      await service.addPosition(OWNER, 'e1', { title: 'President', tiebreak: 'YOUNGEST' });

      expect(notifier.adminStates).toMatchObject([
        { electionId: 'e1', state: { election: { version: 1 }, canUndo: true } },
      ]);
    });
  });

  describe('round closing schedule', () => {
    it('schedules the closing at the round deadline plus the vote grace period', async () => {
      const { service, repository, scheduler } = makeService();
      await repository.create(
        openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
      );

      await service.openRound(OWNER, 'e1', {
        positionId: 'president',
        durationSeconds: ONE_MINUTE_SECONDS,
      });

      // Rodada aberta às 12:00:00 com 60 s de prazo, mais 1 s de tolerância.
      expect(scheduler.pending()).toEqual([
        { key: 'round:e1', at: new Date('2026-01-01T12:01:01.000Z') },
      ]);
    });

    it('cancels the scheduled closing when no round is left open', async () => {
      const { service, repository, scheduler } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));
      scheduler.schedule(START, 'round:e1', () => undefined);

      await service.addPosition(OWNER, 'e1', { title: 'President', tiebreak: 'YOUNGEST' });

      expect(scheduler.pending()).toEqual([]);
    });
  });

  describe('expired rounds', () => {
    it('closes a round past its deadline before applying the command', async () => {
      const { service, repository, clock } = makeService();
      await repository.create(
        openElectionWithVoters({
          id: 'e1',
          adminId: OWNER,
          positionIds: ['president', 'treasurer'],
        }),
      );
      await service.openRound(OWNER, 'e1', {
        positionId: 'president',
        durationSeconds: ONE_MINUTE_SECONDS,
      });
      clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

      await service.openRound(OWNER, 'e1', { positionId: 'treasurer' });

      expect((await repository.get('e1'))?.current.rounds).toMatchObject([
        { positionId: 'president', status: 'CLOSED' },
        { positionId: 'treasurer', status: 'OPEN' },
      ]);
    });
  });
});
