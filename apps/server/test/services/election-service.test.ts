import { revokeVoter } from '@voto/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import { versionConflict } from '../../src/adapters/repository-errors';
import type { ElectionRecord, ElectionRepository } from '../../src/ports';
import { ElectionService } from '../../src/services/election-service';
import { FakeClock } from '../doubles/fake-clock';
import { FakeScheduler } from '../doubles/fake-scheduler';
import { SpyLogger } from '../doubles/spy-logger';
import { SpyNotifier } from '../doubles/spy-notifier';
import { StubCodeGenerator } from '../doubles/stub-code-generator';
import { anElectionRecord, unwrap } from '../support/election-records';
import { openElectionWithVoters, withOpenRound } from '../support/election-fixtures';

const START = new Date('2026-01-01T12:00:00.000Z');
const VOTE_GRACE_MS = 1000;
const HISTORY_LIMIT = 50;
const OWNER = 'admin-1';
const ONE_MINUTE_SECONDS = 60;
const ONE_MINUTE_MS = 60_000;
// Prazo de 1 min mais a tolerância: o último instante tolerado e o horário do timer.
const ONE_MINUTE_AND_ONE_SECOND_MS = 61_000;
const JUST_PAST_THE_GRACE_MS = ONE_MINUTE_AND_ONE_SECOND_MS + 1;

/**
 * Cria o serviço com o domínio real, repositório em memória e doubles nas fronteiras.
 *
 * @param options - Limite do histórico, códigos do gerador e, se o teste precisar de falhas, um
 *   repositório que o serviço usa no lugar do em memória (o `repository` devolvido segue sendo o em memória).
 * @returns O serviço e os doubles, para o teste montar o cenário e inspecionar o efeito.
 */
function makeService(
  options: {
    historyLimit?: number;
    codes?: readonly string[];
    repository?: ElectionRepository;
  } = {},
) {
  const repository = new InMemoryElectionRepository();
  const clock = new FakeClock(START);
  const scheduler = new FakeScheduler();
  const notifier = new SpyNotifier();
  const logger = new SpyLogger();
  let nextId = 0;
  const service = new ElectionService({
    electionRepository: options.repository ?? repository,
    clock,
    scheduler,
    notifier,
    logger,
    codeGenerator: new StubCodeGenerator(options.codes ?? []),
    newId: () => `id-${++nextId}`,
    voteGraceMs: VOTE_GRACE_MS,
    historyLimit: options.historyLimit ?? HISTORY_LIMIT,
  });
  return { service, repository, clock, scheduler, notifier, logger };
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
      clock.advance(JUST_PAST_THE_GRACE_MS);

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

  it('rejects a blank name with INVALID_ELECTION_NAME', async () => {
    const { service } = makeService();

    const creation = service.createElection(OWNER, { name: '   ' });

    await expect(creation).rejects.toMatchObject({ code: 'INVALID_ELECTION_NAME' });
  });

  it('saves nothing when the name is blank', async () => {
    const { service, repository } = makeService();

    await expect(service.createElection(OWNER, { name: '   ' })).rejects.toThrow();

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

  describe('when nothing is overdue', () => {
    it('returns the stored election', async () => {
      const { service, repository } = makeService();
      const stored = anElectionRecord({ id: 'e1', adminId: OWNER, version: 7 });
      await repository.create(stored);

      const record = await service.getElection(OWNER, 'e1');

      expect(record).toEqual(stored);
    });

    it('saves nothing', async () => {
      const { service, repository } = makeService();
      const stored = anElectionRecord({ id: 'e1', adminId: OWNER, version: 7 });
      await repository.create(stored);

      await service.getElection(OWNER, 'e1');

      expect(await repository.get('e1')).toEqual(stored);
    });

    it('notifies nobody', async () => {
      const { service, repository, notifier } = makeService();
      await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER, version: 7 }));

      await service.getElection(OWNER, 'e1');

      expect(notifier.adminStates).toEqual([]);
    });
  });

  describe('when the open round is past its deadline', () => {
    /**
     * Serviço com a eleição `e1` do dono, rodada de 1 min aberta (versão 1) e o relógio
     * 1 ms depois do prazo com a tolerância, ou seja, com a rodada vencida.
     *
     * @returns O serviço e os doubles, como `makeService`.
     */
    async function serviceWithOverdueRound() {
      const test = makeService();
      await test.repository.create(
        openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
      );
      await test.service.openRound(OWNER, 'e1', {
        positionId: 'president',
        durationSeconds: ONE_MINUTE_SECONDS,
      });
      test.clock.advance(JUST_PAST_THE_GRACE_MS);
      return test;
    }

    it('returns the election with the round closed and a new version', async () => {
      const { service } = await serviceWithOverdueRound();

      const record = await service.getElection(OWNER, 'e1');

      expect(record.current).toMatchObject({ version: 2, rounds: [{ status: 'CLOSED' }] });
    });

    it('saves the closed round', async () => {
      const { service, repository } = await serviceWithOverdueRound();

      const record = await service.getElection(OWNER, 'e1');

      expect(await repository.get('e1')).toEqual(record);
    });

    it('notifies the admin with the closed round', async () => {
      const { service, notifier } = await serviceWithOverdueRound();

      await service.getElection(OWNER, 'e1');

      expect(notifier.adminStates.at(-1)?.state).toMatchObject({ election: { version: 2 } });
    });
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

describe('ElectionService at the last instant of the grace period', () => {
  /**
   * Serviço com a eleição `e1`, rodada de 1 min aberta e o relógio no último instante em que
   * um voto ainda é aceito (prazo mais a tolerância).
   *
   * @returns O serviço e os doubles, como `makeService`.
   */
  async function serviceAtTheEndOfTheGrace() {
    const test = makeService();
    await test.repository.create(
      openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
    );
    await test.service.openRound(OWNER, 'e1', {
      positionId: 'president',
      durationSeconds: ONE_MINUTE_SECONDS,
    });
    test.clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);
    return test;
  }

  it('keeps the round open when the admin reads the election', async () => {
    const { service } = await serviceAtTheEndOfTheGrace();

    const record = await service.getElection(OWNER, 'e1');

    expect(record.current).toMatchObject({ version: 1, rounds: [{ status: 'OPEN' }] });
  });

  it('keeps the round open when the admin runs a command', async () => {
    const { service } = await serviceAtTheEndOfTheGrace();

    const record = await service.updateElection(OWNER, 'e1', { name: 'Annual vote' });

    expect(record.current.rounds).toMatchObject([{ status: 'OPEN' }]);
  });

  it('still reports the round in progress as the next step', async () => {
    const { service } = await serviceAtTheEndOfTheGrace();

    const next = await service.nextPosition(OWNER, 'e1');

    expect(next).toMatchObject({ status: 'ROUND_IN_PROGRESS' });
  });
});

describe('ElectionService undo after an automatic closing', () => {
  type TestService = ReturnType<typeof makeService>;

  const AUTOMATIC_CLOSINGS = [
    ['the timer', ({ scheduler, clock }: TestService) => scheduler.fireDue(clock.now())],
    ['an admin read', ({ service }: TestService) => service.getElection(OWNER, 'e1')],
    ['a voter read', ({ service }: TestService) => service.settleDueRound('e1')],
  ] as const;

  it.each(AUTOMATIC_CLOSINGS)(
    'goes back to before the round was opened when %s closed it',
    async (_closer, close) => {
      const test = makeService();
      await test.repository.create(
        openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
      );
      await test.service.openRound(OWNER, 'e1', {
        positionId: 'president',
        durationSeconds: ONE_MINUTE_SECONDS,
      });
      test.clock.advance(JUST_PAST_THE_GRACE_MS);
      await close(test);

      const restored = await test.service.undo(OWNER, 'e1');

      expect(restored.current).toMatchObject({ rounds: [], positions: [{ status: 'PENDING' }] });
    },
  );
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

  it('rejects a blank name with INVALID_ELECTION_NAME', async () => {
    const { service, repository } = makeService();
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    const update = service.updateElection(OWNER, 'e1', { name: '   ' });

    await expect(update).rejects.toMatchObject({ code: 'INVALID_ELECTION_NAME' });
  });

  it('saves nothing when the name is blank', async () => {
    const { service, repository } = makeService();
    const stored = anElectionRecord({ id: 'e1', adminId: OWNER });
    await repository.create(stored);

    await expect(service.updateElection(OWNER, 'e1', { name: '   ' })).rejects.toThrow();

    expect(await repository.get('e1')).toEqual(stored);
  });
});

describe('ElectionService.credentialVoters', () => {
  it('returns the generated codes', async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA', 'BBBBBBBB'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    const { codes } = await service.credentialVoters(OWNER, 'e1', { count: 2 });

    expect(codes).toEqual(['AAAAAAAA', 'BBBBBBBB']);
  });

  it('credentials one voter per generated code', async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA', 'BBBBBBBB'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    await service.credentialVoters(OWNER, 'e1', { count: 2 });

    expect((await repository.get('e1'))?.current.voters).toMatchObject([
      { code: 'AAAAAAAA', status: 'CREDENTIALED' },
      { code: 'BBBBBBBB', status: 'CREDENTIALED' },
    ]);
  });

  it('gives each voter the label at the same position', async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA', 'BBBBBBBB'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    await service.credentialVoters(OWNER, 'e1', { count: 2, labels: ['Table 1', 'Table 2'] });

    expect((await repository.get('e1'))?.current.voters).toMatchObject([
      { label: 'Table 1' },
      { label: 'Table 2' },
    ]);
  });

  it('discards a generated code that already belongs to another election', async () => {
    const { service, repository } = makeService({ codes: ['TAKEN222', 'FRESH222'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));
    await repository.create(
      anElectionRecord({ id: 'e2', adminId: 'admin-2', voterCodes: ['TAKEN222'] }),
    );

    const { codes } = await service.credentialVoters(OWNER, 'e1', { count: 1 });

    expect(codes).toEqual(['FRESH222']);
  });

  it('discards a generated code repeated within the same batch', async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    const { codes } = await service.credentialVoters(OWNER, 'e1', { count: 2 });

    expect(codes).toEqual(['AAAAAAAA', 'BBBBBBBB']);
  });

  it('notifies the admin and each newly credentialed voter', async () => {
    const { service, repository, notifier } = makeService({ codes: ['AAAAAAAA'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    await service.credentialVoters(OWNER, 'e1', { count: 1 });

    expect(notifier.voterStates.map((notified) => notified.voterId)).toEqual(['id-1']);
    expect(notifier.adminStates).toHaveLength(1);
  });

  it("rejects another admin's election with 403", async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: 'admin-2' }));

    const command = service.credentialVoters(OWNER, 'e1', { count: 1 });

    await expect(command).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('rejects more labels than voters with INVALID_VOTER_LABELS', async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA'] });
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    const command = service.credentialVoters(OWNER, 'e1', { count: 1, labels: ['A', 'B'] });

    await expect(command).rejects.toMatchObject({ code: 'INVALID_VOTER_LABELS' });
  });

  it('saves nothing when there are more labels than voters', async () => {
    const { service, repository } = makeService({ codes: ['AAAAAAAA'] });
    const stored = anElectionRecord({ id: 'e1', adminId: OWNER });
    await repository.create(stored);

    await expect(
      service.credentialVoters(OWNER, 'e1', { count: 1, labels: ['A', 'B'] }),
    ).rejects.toThrow();

    expect(await repository.get('e1')).toEqual(stored);
  });
});

describe('ElectionService.revokeVoter', () => {
  it('marks the voter as revoked and keeps the others credentialed', async () => {
    const { service, repository } = makeService();
    await repository.create(
      anElectionRecord({ id: 'e1', adminId: OWNER, voterCodes: ['AAAAAAAA', 'BBBBBBBB'] }),
    );

    await service.revokeVoter(OWNER, 'e1', 'e1:AAAAAAAA');

    expect((await repository.get('e1'))?.current.voters).toMatchObject([
      { code: 'AAAAAAAA', status: 'REVOKED' },
      { code: 'BBBBBBBB', status: 'CREDENTIALED' },
    ]);
  });

  it('rejects an unknown voter with VOTER_NOT_FOUND', async () => {
    const { service, repository } = makeService();
    await repository.create(anElectionRecord({ id: 'e1', adminId: OWNER }));

    const command = service.revokeVoter(OWNER, 'e1', 'ghost');

    await expect(command).rejects.toMatchObject({ code: 'VOTER_NOT_FOUND' });
  });
});

describe('ElectionService.handleDeadline', () => {
  const LOG_MESSAGE = 'Failed to close the round at its deadline';

  /**
   * Serviço com a eleição `e1` do dono e uma rodada de 1 min aberta (versão 1).
   *
   * @param options - Repassadas a `makeService` (ex.: limite do histórico ou outro repositório).
   * @returns O serviço e os doubles, como `makeService`.
   */
  async function serviceWithOpenRound(options: Parameters<typeof makeService>[0] = {}) {
    const test = makeService(options);
    await test.repository.create(
      openElectionWithVoters({ id: 'e1', adminId: OWNER, positionIds: ['president'] }),
    );
    await test.service.openRound(OWNER, 'e1', {
      positionId: 'president',
      durationSeconds: ONE_MINUTE_SECONDS,
    });
    return test;
  }

  it('closes the round once its deadline has passed', async () => {
    const { service, repository, clock } = await serviceWithOpenRound();
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

    await service.handleDeadline('e1');

    expect((await repository.get('e1'))?.current).toMatchObject({
      version: 2,
      rounds: [{ status: 'CLOSED' }],
    });
  });

  it('notifies the admin that the round closed', async () => {
    const { service, clock, notifier } = await serviceWithOpenRound();
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

    await service.handleDeadline('e1');

    expect(notifier.adminStates.at(-1)?.state).toMatchObject({ election: { version: 2 } });
  });

  it('notifies each credentialed voter that the round closed', async () => {
    const { service, clock, notifier } = await serviceWithOpenRound();
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

    await service.handleDeadline('e1');

    expect(notifier.voterStates.at(-1)).toMatchObject({
      voterId: 'e1:VOTER1',
      state: { phase: 'WAITING' },
    });
  });

  it('cancels the scheduled closing once the round is closed', async () => {
    const { service, clock, scheduler } = await serviceWithOpenRound();
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

    await service.handleDeadline('e1');

    expect(scheduler.pending()).toEqual([]);
  });

  it('closes the round even if the timer fires a millisecond early', async () => {
    // O `setTimeout` pode adiantar; se o timer descontasse a tolerância, nada fecharia a rodada.
    const { service, repository, clock } = await serviceWithOpenRound();
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS - 1);

    await service.handleDeadline('e1');

    expect((await repository.get('e1'))?.current.rounds).toMatchObject([{ status: 'CLOSED' }]);
  });

  describe('when the round is not due', () => {
    it('saves nothing', async () => {
      const { service, repository, clock } = await serviceWithOpenRound();
      const before = await repository.get('e1');
      clock.advance(ONE_MINUTE_MS);

      await service.handleDeadline('e1');

      expect(await repository.get('e1')).toEqual(before);
    });

    it('notifies nobody', async () => {
      const { service, clock, notifier } = await serviceWithOpenRound();
      const notifiedBefore = notifier.adminStates.length;
      clock.advance(ONE_MINUTE_MS);

      await service.handleDeadline('e1');

      expect(notifier.adminStates).toHaveLength(notifiedBefore);
    });
  });

  it('ignores an election that no longer exists', async () => {
    const { service, logger } = makeService();

    await service.handleDeadline('missing');

    expect(logger.errors).toEqual([]);
  });

  it('closes the round when the closing scheduled by openRound fires', async () => {
    const { repository, clock, scheduler } = await serviceWithOpenRound();
    // 1 min de prazo + 1 s de tolerância: o horário agendado pela abertura.
    clock.advance(ONE_MINUTE_AND_ONE_SECOND_MS);

    await scheduler.fireDue(clock.now());

    expect((await repository.get('e1'))?.current.rounds).toMatchObject([{ status: 'CLOSED' }]);
  });

  describe('when something fails', () => {
    /** Repositório cuja leitura falha, como um banco fora do ar. */
    class UnavailableRepository extends InMemoryElectionRepository {
      override async get(): Promise<never> {
        throw new Error('database down');
      }
    }

    it('logs the failure instead of rejecting', async () => {
      const { service, logger } = makeService({ repository: new UnavailableRepository() });

      await service.handleDeadline('e1');

      expect(logger.errors).toMatchObject([
        { context: { electionId: 'e1', err: new Error('database down') }, message: LOG_MESSAGE },
      ]);
    });
  });
});

describe('ElectionService.castVote', () => {
  const FIRST_VOTER = 'e1:VOTERAAA';
  const SECOND_VOTER = 'e1:VOTERBBB';
  const VOTE = { roundId: 'r1', choice: 'president-candidate' };
  const MAX_VOTE_ATTEMPTS = 50;
  const LONG_AFTER_THE_DEADLINE_MS = 10 * ONE_MINUTE_MS;

  /** Repositório cujas próximas gravações falham com os erros enfileirados pelo teste. */
  class FailingSaveRepository extends InMemoryElectionRepository {
    /** Erros que as próximas gravações lançam, um por gravação, em ordem. */
    pendingFailures: Error[] = [];
    /** Roda a cada falha, para simular o que acontece enquanto o voto espera. */
    onFailure: () => void = () => undefined;

    override save(record: ElectionRecord, expectedVersion: number): Promise<void> {
      const failure = this.pendingFailures.shift();
      if (!failure) return super.save(record, expectedVersion);
      this.onFailure();
      return Promise.reject(failure);
    }
  }

  /**
   * Serviço com a eleição `e1`, dois eleitores e a rodada `r1` (1 min) aberta em `START`.
   *
   * @returns O serviço, os doubles e o repositório que pode ser programado para falhar.
   */
  async function serviceWithTwoVoters() {
    const repository = new FailingSaveRepository();
    const election = openElectionWithVoters({
      id: 'e1',
      adminId: OWNER,
      positionIds: ['president'],
      voterCodes: ['VOTERAAA', 'VOTERBBB'],
    });
    await repository.create(
      withOpenRound(election, { positionId: 'president', roundId: 'r1', openedAt: START }),
    );
    return { ...makeService({ repository }), repository };
  }

  describe('undo history', () => {
    // A primeira rodada aberta pelo serviço recebe o primeiro id gerado.
    const FIRST_VOTE = { roundId: 'id-1', choice: 'president-candidate' };

    /**
     * Serviço com a eleição `e1`, dois eleitores e a rodada de `president` aberta pelo admin,
     * ou seja, com um passo desfazível no histórico.
     *
     * @param options - Repassadas a `makeService` (ex.: limite do histórico).
     * @returns O serviço e os doubles, como `makeService`.
     */
    async function serviceWithRoundOpenedByAdmin(options: Parameters<typeof makeService>[0] = {}) {
      const test = makeService(options);
      await test.repository.create(
        openElectionWithVoters({
          id: 'e1',
          adminId: OWNER,
          positionIds: ['president'],
          voterCodes: ['VOTERAAA', 'VOTERBBB'],
        }),
      );
      await test.service.openRound(OWNER, 'e1', { positionId: 'president' });
      return test;
    }

    it('undoes the opening of the round, not just the last vote', async () => {
      const { service } = await serviceWithRoundOpenedByAdmin();
      await service.castVote(FIRST_VOTER, 'e1', FIRST_VOTE);

      const restored = await service.undo(OWNER, 'e1');

      expect(restored.current).toMatchObject({ rounds: [], positions: [{ status: 'PENDING' }] });
    });

    it('does not let votes push the admin steps out of the history', async () => {
      const { service, repository } = await serviceWithRoundOpenedByAdmin({ historyLimit: 1 });

      await service.castVote(FIRST_VOTER, 'e1', FIRST_VOTE);
      await service.castVote(SECOND_VOTER, 'e1', FIRST_VOTE);

      expect((await repository.get('e1'))?.past).toMatchObject([{ version: 0, rounds: [] }]);
    });

    it('does not turn the vote that closes the round into a step either', async () => {
      const { service } = await serviceWithRoundOpenedByAdmin();
      await service.castVote(FIRST_VOTER, 'e1', FIRST_VOTE);
      await service.castVote(SECOND_VOTER, 'e1', FIRST_VOTE);

      const restored = await service.undo(OWNER, 'e1');

      expect(restored.current.rounds).toEqual([]);
    });

    it('still saves each vote under the next version', async () => {
      const { service, repository } = await serviceWithRoundOpenedByAdmin();

      await service.castVote(FIRST_VOTER, 'e1', FIRST_VOTE);

      // Versão 0 → 1 (rodada aberta) → 2 (voto).
      expect((await repository.get('e1'))?.current.version).toBe(2);
    });
  });

  describe('when votes arrive at the same time', () => {
    it('accepts and counts the votes of two different voters', async () => {
      const { service, repository } = await serviceWithTwoVoters();

      const votes = Promise.all([
        service.castVote(FIRST_VOTER, 'e1', VOTE),
        service.castVote(SECOND_VOTER, 'e1', VOTE),
      ]);

      await expect(votes).resolves.toHaveLength(2);
      expect((await repository.get('e1'))?.current.rounds[0]).toMatchObject({
        votedVoterIds: [FIRST_VOTER, SECOND_VOTER],
        tally: { 'president-candidate': 2 },
      });
    });

    it('refuses the repeated vote of the same voter and counts only one', async () => {
      const { service, repository } = await serviceWithTwoVoters();

      const first = service.castVote(FIRST_VOTER, 'e1', VOTE);
      const repeated = service.castVote(FIRST_VOTER, 'e1', VOTE);

      await Promise.all([
        first,
        expect(repeated).rejects.toMatchObject({ code: 'VOTER_ALREADY_VOTED' }),
      ]);
      expect((await repository.get('e1'))?.current.rounds[0]?.tally).toEqual({
        'president-candidate': 1,
      });
    });
  });

  describe('when saving the vote keeps conflicting', () => {
    it('accepts the vote when only the last allowed attempt can save it', async () => {
      const { service, repository } = await serviceWithTwoVoters();
      repository.pendingFailures = Array.from({ length: MAX_VOTE_ATTEMPTS - 1 }, versionConflict);

      await service.castVote(FIRST_VOTER, 'e1', VOTE);

      expect((await repository.get('e1'))?.current.rounds[0]?.votedVoterIds).toEqual([FIRST_VOTER]);
    });

    it('gives up with VERSION_CONFLICT after the maximum number of attempts', async () => {
      const { service, repository } = await serviceWithTwoVoters();
      repository.pendingFailures = Array.from({ length: MAX_VOTE_ATTEMPTS }, versionConflict);

      const vote = service.castVote(FIRST_VOTER, 'e1', VOTE);

      await expect(vote).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    });

    it('judges the deadline by when the vote arrived, not by when it is retried', async () => {
      const { service, repository, clock } = await serviceWithTwoVoters();
      repository.pendingFailures = [versionConflict()];
      repository.onFailure = () => clock.advance(LONG_AFTER_THE_DEADLINE_MS);

      await service.castVote(FIRST_VOTER, 'e1', VOTE);

      expect((await repository.get('e1'))?.current.rounds[0]?.votedVoterIds).toEqual([FIRST_VOTER]);
    });
  });

  it('does not retry a failure other than a version conflict', async () => {
    const { service, repository } = await serviceWithTwoVoters();
    repository.pendingFailures = [new Error('database down')];

    const vote = service.castVote(FIRST_VOTER, 'e1', VOTE);

    await expect(vote).rejects.toThrow('database down');
  });

  it('does not extend the retry to admin commands', async () => {
    const { service, repository } = await serviceWithTwoVoters();
    repository.pendingFailures = [versionConflict()];

    const command = service.closeRound(OWNER, 'e1', 'r1');

    await expect(command).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });
});
