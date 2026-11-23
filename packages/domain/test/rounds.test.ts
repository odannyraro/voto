import { describe, expect, it } from 'vitest';
import { openElection, openRound } from '../src/index';
import { aCandidate, anElection, aPosition, aRound, aVoter } from './builders/election-builder';
import { FIXED_NOW, fixedContext, secondsAfter } from './builders/fixed-context';

const ROUND_SECONDS = 45;

describe('openElection', () => {
  it('opens a draft election that has positions', () => {
    const election = anElection().withPositions(aPosition()).build();

    const result = openElection(election);

    expect(result).toMatchObject({ ok: true, value: { status: 'OPEN' } });
  });

  it('rejects opening an election without positions', () => {
    const election = anElection().build();

    const result = openElection(election);

    expect(result).toMatchObject({ ok: false, error: { code: 'NO_POSITIONS' } });
  });

  it('rejects opening an election twice', () => {
    const election = anElection().open().withPositions(aPosition()).build();

    const result = openElection(election);

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_NOT_DRAFT' } });
  });
});

describe('openRound', () => {
  /** Eleição aberta com o cargo President pronto para votar: 2 candidatos e 2 eleitores. */
  function readyElection() {
    return anElection()
      .open()
      .withPositions(
        aPosition({ id: 'president' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .withCandidates(aCandidate({ id: 'ana' }), aCandidate({ id: 'bia', name: 'Bia' }))
      .withVoters(
        aVoter({ id: 'voter-1', code: 'AAAA2222' }),
        aVoter({ id: 'voter-2', code: 'BBBB3333' }),
      )
      .build();
  }

  it('opens a first round with the ballot and the voters frozen at that moment', () => {
    const result = openRound(
      readyElection(),
      { positionId: 'president', durationSeconds: ROUND_SECONDS },
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        rounds: [
          {
            id: 'id-1',
            positionId: 'president',
            kind: 'FIRST',
            candidateIds: ['ana', 'bia'],
            eligibleVoterIds: ['voter-1', 'voter-2'],
            votedVoterIds: [],
            tally: {},
            status: 'OPEN',
            openedAt: FIXED_NOW.toISOString(),
            deadline: secondsAfter(FIXED_NOW, ROUND_SECONDS).toISOString(),
            resultsReleased: false,
          },
        ],
      },
    });
  });

  it('marks the position as voting and takes it out of the queue', () => {
    const result = openRound(readyElection(), { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({
      ok: true,
      value: {
        positions: [{ id: 'president', status: 'VOTING' }, { id: 'treasurer' }],
        queue: ['treasurer'],
      },
    });
  });

  it('uses the default voting duration of the election when none is given', () => {
    const election = { ...readyElection(), defaultVotingSeconds: 90 };

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({
      ok: true,
      value: { rounds: [{ deadline: secondsAfter(FIXED_NOW, 90).toISOString() }] },
    });
  });

  it('leaves candidates elected to another position off the ballot', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ id: 'president', status: 'DECIDED', electedCandidateId: 'ana' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president', 'treasurer'] }),
        aCandidate({ id: 'bia', applications: ['treasurer'] }),
      )
      .withVoters(aVoter())
      .build();

    const result = openRound(election, { positionId: 'treasurer' }, fixedContext());

    expect(result).toMatchObject({ ok: true, value: { rounds: [{ candidateIds: ['bia'] }] } });
  });

  it('leaves revoked voters out of the round', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .withVoters(
        aVoter({ id: 'voter-1' }),
        aVoter({ id: 'voter-2', code: 'BBBB3333', status: 'REVOKED' }),
      )
      .build();

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({
      ok: true,
      value: { rounds: [{ eligibleVoterIds: ['voter-1'] }] },
    });
  });

  it('rejects a second round while another one is open', () => {
    const election = {
      ...readyElection(),
      rounds: [aRound({ positionId: 'treasurer', status: 'OPEN' })],
    };

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_IN_PROGRESS' } });
  });

  it('rejects a new round while a runoff is waiting to be opened', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ id: 'president', status: 'AWAITING_RUNOFF' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .withCandidates(aCandidate({ id: 'ana', applications: ['treasurer'] }))
      .withVoters(aVoter())
      .build();

    const result = openRound(election, { positionId: 'treasurer' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'RUNOFF_PENDING' } });
  });

  it('rejects a position that is not waiting to be voted', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'CANCELLED' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .withVoters(aVoter())
      .build();

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_PENDING' } });
  });

  it('rejects an unknown position', () => {
    const result = openRound(readyElection(), { positionId: 'ghost' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects a position without eligible candidates', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president' }))
      .withVoters(aVoter())
      .build();

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'NO_ELIGIBLE_CANDIDATES' } });
  });

  it('rejects opening a round when no voter is credentialed', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate())
      .build();

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'NO_CREDENTIALED_VOTERS' } });
  });

  it('rejects an invalid voting duration', () => {
    const result = openRound(
      readyElection(),
      { positionId: 'president', durationSeconds: 1 },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_VOTING_DURATION' } });
  });

  it('rejects rounds before the election is open', () => {
    const election = { ...readyElection(), status: 'DRAFT' as const };

    const result = openRound(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_NOT_OPEN' } });
  });
});
