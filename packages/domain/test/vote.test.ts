import { describe, expect, it } from 'vitest';
import { BLANK, castVote, type Round } from '../src/index';
import { aCandidate, anElection, aPosition, aRound, aVoter } from './builders/election-builder';
import { FIXED_NOW, fixedContext, secondsAfter } from './builders/fixed-context';

const DEADLINE = secondsAfter(FIXED_NOW, 60);

/**
 * Eleição aberta com o 1º turno de President em andamento: cédula Ana e Bia,
 * eleitores aptos voter-1 e voter-2 (e um terceiro, credenciado depois da abertura).
 *
 * @param round - Campos da rodada a sobrescrever.
 * @returns A eleição.
 */
function electionVoting(round: Partial<Round> = {}) {
  return anElection()
    .open()
    .withPositions(aPosition({ id: 'president', status: 'VOTING' }))
    .withCandidates(aCandidate({ id: 'ana' }), aCandidate({ id: 'bia', name: 'Bia' }))
    .withVoters(
      aVoter({ id: 'voter-1', code: 'AAAA2222' }),
      aVoter({ id: 'voter-2', code: 'BBBB3333' }),
      aVoter({ id: 'late-voter', code: 'CCCC4444' }),
    )
    .withRounds(
      aRound({
        id: 'round-1',
        candidateIds: ['ana', 'bia'],
        eligibleVoterIds: ['voter-1', 'voter-2'],
        deadline: DEADLINE.toISOString(),
        ...round,
      }),
    )
    .build();
}

describe('castVote', () => {
  it('counts the vote and records that the voter voted', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'voter-1', choice: 'ana' },
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { rounds: [{ tally: { ana: 1 }, votedVoterIds: ['voter-1'] }] },
    });
  });

  it('counts a blank vote apart from the candidates', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'voter-1', choice: BLANK },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: true, value: { rounds: [{ tally: { [BLANK]: 1 } }] } });
  });

  it('keeps the voter id out of the vote count, so nobody can tell who voted for whom', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'voter-1', choice: 'ana' },
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { rounds: [{ tally: expect.not.objectContaining({ 'voter-1': expect.anything() }) }] },
    });
  });

  it('accepts a vote at the exact deadline', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'voter-1', choice: 'ana' },
      fixedContext(DEADLINE),
    );

    expect(result).toMatchObject({ ok: true });
  });

  it('rejects a vote after the deadline even if the round was not closed yet', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'voter-1', choice: 'ana' },
      fixedContext(secondsAfter(DEADLINE, 1)),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_EXPIRED' } });
  });

  it('rejects a second vote from the same voter in a round', () => {
    const election = electionVoting({ votedVoterIds: ['voter-1'], tally: { ana: 1 } });

    const result = castVote(
      election,
      { roundId: 'round-1', voterId: 'voter-1', choice: 'bia' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'VOTER_ALREADY_VOTED' } });
  });

  it('rejects a voter credentialed after the round opened', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'late-voter', choice: 'ana' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'VOTER_NOT_ELIGIBLE' } });
  });

  it('rejects a voter whose code was revoked during the round', () => {
    const election = electionVoting();
    const revoked = {
      ...election,
      voters: election.voters.map((v) => ({ ...v, status: 'REVOKED' as const })),
    };

    const result = castVote(
      revoked,
      { roundId: 'round-1', voterId: 'voter-1', choice: 'ana' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'VOTER_REVOKED' } });
  });

  it('rejects a choice that is not on the ballot', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'round-1', voterId: 'voter-1', choice: 'caio' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CHOICE' } });
  });

  it('rejects votes in a closed round', () => {
    const election = electionVoting({ status: 'CLOSED' });

    const result = castVote(
      election,
      { roundId: 'round-1', voterId: 'voter-1', choice: 'ana' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_OPEN' } });
  });

  it('rejects an unknown round', () => {
    const result = castVote(
      electionVoting(),
      { roundId: 'ghost', voterId: 'voter-1', choice: 'ana' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_FOUND' } });
  });
});
