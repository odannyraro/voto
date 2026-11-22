import { describe, expect, it } from 'vitest';
import { lastResultView, releaseResults, voterView, type Round } from '../src/index';
import { aCandidate, anElection, aPosition, aRound, aVoter } from './builders/election-builder';

/**
 * Eleição aberta do cargo President (Ana × Bia) com uma rodada configurável e dois
 * eleitores: voter-1 (apto na rodada) e late-voter (credenciado depois da abertura).
 *
 * @param round - Campos da rodada a sobrescrever.
 * @returns A eleição.
 */
function electionWithRound(round: Partial<Round>) {
  return anElection()
    .open()
    .withPositions(aPosition({ id: 'president', title: 'President', status: 'VOTING' }))
    .withCandidates(aCandidate({ id: 'ana', name: 'Ana' }), aCandidate({ id: 'bia', name: 'Bia' }))
    .withVoters(aVoter({ id: 'voter-1' }), aVoter({ id: 'late-voter', code: 'CCCC4444' }))
    .withRounds(aRound({ id: 'round-1', candidateIds: ['ana', 'bia'], eligibleVoterIds: ['voter-1'], ...round }))
    .build();
}

describe('releaseResults', () => {
  it('makes the result of a closed round visible to the voters', () => {
    const election = electionWithRound({ status: 'CLOSED', tally: { ana: 1 } });

    const result = releaseResults(election, 'round-1');

    expect(result).toMatchObject({ ok: true, value: { rounds: [{ resultsReleased: true }] } });
  });

  it('rejects releasing the result of a round that is still open', () => {
    const election = electionWithRound({ status: 'OPEN' });

    const result = releaseResults(election, 'round-1');

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_CLOSED' } });
  });

  it('rejects an unknown round', () => {
    const result = releaseResults(electionWithRound({}), 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_FOUND' } });
  });
});

describe('lastResultView', () => {
  it('describes the latest closed round with the position title and candidate names', () => {
    const election = electionWithRound({ status: 'CLOSED', tally: { ana: 2, bia: 1 } });

    const view = lastResultView(election);

    expect(view).toMatchObject({
      roundId: 'round-1',
      positionTitle: 'President',
      counts: [
        { candidateId: 'ana', name: 'Ana', votes: 2 },
        { candidateId: 'bia', name: 'Bia', votes: 1 },
      ],
      outcome: 'ELECTED',
      electedCandidateId: 'ana',
    });
  });

  it('has nothing to show while no round was closed', () => {
    const election = electionWithRound({ status: 'OPEN' });

    const view = lastResultView(election);

    expect(view).toBeUndefined();
  });
});

describe('voterView', () => {
  it('shows the waiting screen before any round is opened', () => {
    const election = { ...electionWithRound({}), rounds: [] };

    const view = voterView(election, 'voter-1');

    expect(view).toEqual({ phase: 'WAITING', electionName: election.name });
  });

  it('shows the ballot with candidate names and deadline, but no vote counts', () => {
    const election = electionWithRound({ status: 'OPEN', tally: { ana: 3 } });

    const view = voterView(election, 'voter-1');

    expect(view).toEqual({
      phase: 'VOTING',
      round: {
        roundId: 'round-1',
        positionTitle: 'President',
        kind: 'FIRST',
        candidates: [
          { id: 'ana', name: 'Ana' },
          { id: 'bia', name: 'Bia' },
        ],
        deadline: election.rounds[0]?.deadline,
      },
    });
  });

  it('confirms the vote after the voter voted in the open round', () => {
    const election = electionWithRound({ status: 'OPEN', votedVoterIds: ['voter-1'] });

    const view = voterView(election, 'voter-1');

    expect(view).toEqual({ phase: 'VOTED', roundId: 'round-1' });
  });

  it('keeps a voter credentialed after the round opened on the waiting screen', () => {
    const election = electionWithRound({ status: 'OPEN' });

    const view = voterView(election, 'late-voter');

    expect(view).toMatchObject({ phase: 'WAITING' });
  });

  it('hides the result from voters until the admin releases it', () => {
    const election = electionWithRound({ status: 'CLOSED', tally: { ana: 1 }, resultsReleased: false });

    const view = voterView(election, 'voter-1');

    expect(view).toMatchObject({ phase: 'WAITING' });
  });

  it('shows the released result to the voters', () => {
    const election = electionWithRound({ status: 'CLOSED', tally: { ana: 1 }, resultsReleased: true });

    const view = voterView(election, 'voter-1');

    expect(view).toMatchObject({ phase: 'RESULTS', result: { roundId: 'round-1', electedCandidateId: 'ana' } });
  });

  it('shows the closing screen once the election is finished', () => {
    const election = { ...electionWithRound({ status: 'CLOSED' }), status: 'FINISHED' as const };

    const view = voterView(election, 'voter-1');

    expect(view).toEqual({ phase: 'FINISHED' });
  });
});
