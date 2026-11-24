import { revokeVoter } from '@voto/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import { ElectionService } from '../../src/services/election-service';
import { FakeClock } from '../doubles/fake-clock';
import { FakeScheduler } from '../doubles/fake-scheduler';
import { SpyNotifier } from '../doubles/spy-notifier';
import { anElectionRecord, unwrap } from '../support/election-records';
import { openElectionWithVoters } from '../support/election-fixtures';

const START = new Date('2026-01-01T12:00:00.000Z');
const VOTE_GRACE_MS = 1000;
const HISTORY_LIMIT = 50;
const OWNER = 'admin-1';
const ONE_MINUTE_SECONDS = 60;
const ONE_MINUTE_MS = 60_000;
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

  describe('notifications', () => {
    it('sends the admin the full panel state, with the open round and the server clock', async () => {
      const { service, repository, notifier } = makeService();
      await repository.create(
        openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
      );

      await service.openRound(OWNER, 'e1', {
        positionId: 'president',
        durationSeconds: ONE_MINUTE_SECONDS,
      });

      expect(notifier.adminStates).toMatchObject([
        {
          electionId: 'e1',
          state: {
            currentRound: { positionTitle: 'president', votedCount: 0, eligibleCount: 1 },
            next: { status: 'ROUND_IN_PROGRESS' },
            serverNow: '2026-01-01T12:00:00.000Z',
          },
        },
      ]);
    });

    it('sends every credentialed voter their own state', async () => {
      const { service, repository, notifier } = makeService();
      await repository.create(
        openElectionWithVoters({
          id: 'e1',
          adminId: OWNER,
          positionIds: ['president'],
          voterCodes: ['ANA-CODE', 'BIA-CODE'],
        }),
      );

      await service.openRound(OWNER, 'e1', { positionId: 'president' });

      expect(notifier.voterStates).toMatchObject([
        { voterId: 'e1:ANA-CODE', state: { phase: 'VOTING' } },
        { voterId: 'e1:BIA-CODE', state: { phase: 'VOTING' } },
      ]);
    });

    it('does not notify a revoked voter', async () => {
      const { service, repository, notifier } = makeService();
      const open = openElectionWithVoters({
        id: 'e1',
        adminId: OWNER,
        positionIds: ['president'],
        voterCodes: ['ANA-CODE', 'BIA-CODE'],
      });
      await repository.create({
        ...open,
        current: unwrap(revokeVoter(open.current, 'e1:BIA-CODE')),
      });

      await service.openRound(OWNER, 'e1', { positionId: 'president' });

      expect(notifier.voterStates.map(({ voterId }) => voterId)).toEqual(['e1:ANA-CODE']);
    });

    it('notifies no voter when the domain rejects the command', async () => {
      const { service, repository, notifier } = makeService();
      await repository.create(
        anElectionRecord({ id: 'e1', adminId: OWNER, voterCodes: ['ANA-CODE'] }),
      );

      await expect(
        service.addPosition(OWNER, 'e1', { title: '   ', tiebreak: 'YOUNGEST' }),
      ).rejects.toThrow();

      expect(notifier.voterStates).toEqual([]);
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

describe('ElectionService.createElection', () => {
  it('saves a new draft election owned by the admin, with version 0', async () => {
    const { service, repository } = makeService();

    const record = await service.createElection(OWNER, { name: '  Board election  ' });

    expect((await repository.get(record.current.id))?.current).toMatchObject({
      adminId: OWNER,
      name: 'Board election',
      status: 'DRAFT',
      version: 0,
    });
  });

  it('starts without undo history', async () => {
    const { service } = makeService();

    const record = await service.createElection(OWNER, { name: 'Board election' });

    expect(record.past).toEqual([]);
  });

  it('notifies the admin with the new election', async () => {
    const { service, notifier } = makeService();

    const record = await service.createElection(OWNER, { name: 'Board election' });

    expect(notifier.adminStates).toMatchObject([
      { electionId: record.current.id, state: { election: { name: 'Board election' } } },
    ]);
  });

  it('rejects a blank name and saves nothing', async () => {
    const { service, repository } = makeService();

    const creation = service.createElection(OWNER, { name: '   ' });

    await expect(creation).rejects.toMatchObject({ code: 'INVALID_ELECTION_NAME' });
    expect(await repository.listAll()).toEqual([]);
  });
});

describe('ElectionService.listElections', () => {
  it("summarizes only the admin's own elections", async () => {
    const { service, repository } = makeService();
    await repository.create(
      anElectionRecord({ id: 'draft', adminId: OWNER, voterCodes: ['A', 'B'] }),
    );
    await repository.create(
      openElectionWithVoters({ id: 'open', adminId: OWNER, positionIds: ['p1', 'p2', 'p3'] }),
    );
    await repository.create(anElectionRecord({ id: 'other', adminId: 'admin-2' }));

    const summaries = await service.listElections(OWNER);

    expect(summaries).toEqual([
      { id: 'draft', name: 'Board election', status: 'DRAFT', positionCount: 0, voterCount: 2 },
      { id: 'open', name: 'Board election', status: 'OPEN', positionCount: 3, voterCount: 1 },
    ]);
  });

  it('returns an empty list for an admin without elections', async () => {
    const { service } = makeService();

    expect(await service.listElections(OWNER)).toEqual([]);
  });
});

describe('ElectionService.getElection', () => {
  it('rejects an election that does not exist with 404', async () => {
    const { service } = makeService();

    const read = service.getElection(OWNER, 'missing');

    await expect(read).rejects.toMatchObject({ status: 404, code: 'ELECTION_NOT_FOUND' });
  });

  it("rejects another admin's election with 403", async () => {
    const { service, repository } = makeService();
    await repository.create(anElectionRecord({ id: 'e1', adminId: 'admin-1' }));

    const read = service.getElection('admin-2', 'e1');

    await expect(read).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('returns the stored election without saving or notifying when nothing is overdue', async () => {
    const { service, repository, notifier } = makeService();
    const stored = anElectionRecord({ id: 'e1', adminId: OWNER, version: 7 });
    await repository.create(stored);

    const record = await service.getElection(OWNER, 'e1');

    expect(record).toEqual(stored);
    expect(await repository.get('e1')).toEqual(stored);
    expect(notifier.adminStates).toEqual([]);
  });

  it('closes a round past its deadline, saves the result and notifies the admin', async () => {
    const { service, repository, clock, notifier } = makeService();
    await repository.create(
      openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
    );
    await service.openRound(OWNER, 'e1', {
      positionId: 'president',
      durationSeconds: ONE_MINUTE_SECONDS,
    });
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

    const record = await service.getElection(OWNER, 'e1');

    expect(record.current).toMatchObject({ version: 2, rounds: [{ status: 'CLOSED' }] });
    expect(await repository.get('e1')).toEqual(record);
    expect(notifier.adminStates.at(-1)?.state).toMatchObject({ election: { version: 2 } });
  });

  it('keeps a round open until its deadline has passed', async () => {
    const { service, repository, clock } = makeService();
    await repository.create(
      openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
    );
    await service.openRound(OWNER, 'e1', {
      positionId: 'president',
      durationSeconds: ONE_MINUTE_SECONDS,
    });
    clock.advance(ONE_MINUTE_MS);

    const record = await service.getElection(OWNER, 'e1');

    expect(record.current).toMatchObject({ version: 1, rounds: [{ status: 'OPEN' }] });
  });
});

describe('ElectionService.updateElection', () => {
  it('changes the name and the default voting time, incrementing the version', async () => {
    const { service, repository } = makeService();
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    await service.updateElection(OWNER, 'e1', { name: 'Annual vote', defaultVotingSeconds: 90 });

    expect((await repository.get('e1'))?.current).toMatchObject({
      name: 'Annual vote',
      defaultVotingSeconds: 90,
      version: 1,
    });
  });

  it('keeps the fields that were not sent', async () => {
    const { service, repository } = makeService();
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    await service.updateElection(OWNER, 'e1', { defaultVotingSeconds: 90 });

    expect((await repository.get('e1'))?.current.name).toBe('Board election');
  });

  it('rejects a blank name and saves nothing', async () => {
    const { service, repository } = makeService();
    const stored = anElectionRecord({ id: 'e1', adminId: OWNER });
    await repository.create(stored);

    const update = service.updateElection(OWNER, 'e1', { name: '   ' });

    await expect(update).rejects.toMatchObject({ code: 'INVALID_ELECTION_NAME' });
    expect(await repository.get('e1')).toEqual(stored);
  });
});
