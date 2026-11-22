import { describe, expect, it } from 'vitest';
import { annulRound, eligibleCandidates } from '../src/index';
import { aCandidate, anElection, aPosition, aRound, aVoter } from './builders/election-builder';
import { valueOf } from './builders/result-helpers';

describe('annulRound', () => {
  it('annuls the open round and puts the position back at the front of the queue', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'VOTING' }), aPosition({ id: 'treasurer', title: 'Treasurer' }))
      .withRounds(aRound({ id: 'round-1', positionId: 'president', status: 'OPEN' }))
      .withQueue('treasurer')
      .build();

    const result = annulRound(election, 'round-1');

    expect(result).toMatchObject({
      ok: true,
      value: {
        rounds: [{ status: 'ANNULLED' }],
        positions: [{ id: 'president', status: 'PENDING' }, { id: 'treasurer' }],
        queue: ['president', 'treasurer'],
      },
    });
  });

  it('undoes the election of the winner, who becomes eligible for other positions again', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ id: 'president', status: 'DECIDED', electedCandidateId: 'ana' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .withCandidates(aCandidate({ id: 'ana', applications: ['president', 'treasurer'] }))
      .withVoters(aVoter())
      .withRounds(aRound({ id: 'round-1', positionId: 'president', candidateIds: ['ana'], tally: { ana: 1 }, status: 'CLOSED' }))
      .withQueue('treasurer')
      .build();

    const annulled = valueOf(annulRound(election, 'round-1'));

    expect(eligibleCandidates(annulled, 'treasurer').map((candidate) => candidate.id)).toEqual(['ana']);
  });

  it('rejects annulling a round that is not the latest of its position', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'VOTING' }))
      .withRounds(
        aRound({ id: 'first-round', positionId: 'president', status: 'CLOSED' }),
        aRound({ id: 'runoff', positionId: 'president', kind: 'RUNOFF', status: 'OPEN' }),
      )
      .build();

    const result = annulRound(election, 'first-round');

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_LATEST' } });
  });

  it('rejects an unknown round', () => {
    const election = anElection().open().build();

    const result = annulRound(election, 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_FOUND' } });
  });
});
