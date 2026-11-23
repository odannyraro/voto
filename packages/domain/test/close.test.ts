import { describe, expect, it } from 'vitest';
import { castVote, closeRound, closeRoundIfDue, type Round } from '../src/index';
import { aCandidate, anElection, aPosition, aRound, aVoter } from './builders/election-builder';
import { FIXED_NOW, fixedContext, secondsAfter } from './builders/fixed-context';

const DEADLINE = secondsAfter(FIXED_NOW, 60);

/**
 * Eleição aberta com o 1º turno de President em andamento (cédula Ana, Bia e Caio;
 * aptos voter-1 e voter-2) e o cargo Treasurer esperando na fila.
 *
 * @param round - Campos da rodada a sobrescrever (normalmente a contagem).
 * @returns A eleição.
 */
function electionVoting(round: Partial<Round> = {}) {
  return anElection()
    .open()
    .withPositions(aPosition({ id: 'president', status: 'VOTING' }), aPosition({ id: 'treasurer', title: 'Treasurer' }))
    .withCandidates(
      aCandidate({ id: 'ana', age: 30 }),
      aCandidate({ id: 'bia', name: 'Bia', age: 25 }),
      aCandidate({ id: 'caio', name: 'Caio', age: 20 }),
    )
    .withVoters(aVoter({ id: 'voter-1', code: 'AAAA2222' }), aVoter({ id: 'voter-2', code: 'BBBB3333' }))
    .withRounds(
      aRound({
        id: 'round-1',
        candidateIds: ['ana', 'bia', 'caio'],
        eligibleVoterIds: ['voter-1', 'voter-2'],
        deadline: DEADLINE.toISOString(),
        ...round,
      }),
    )
    .withQueue('treasurer')
    .build();
}

describe('closeRound', () => {
  it('closes the round and declares the candidate with majority elected', () => {
    const election = electionVoting({ tally: { ana: 2 }, votedVoterIds: ['voter-1', 'voter-2'] });

    const result = closeRound(election, 'round-1');

    expect(result).toMatchObject({
      ok: true,
      value: {
        rounds: [{ status: 'CLOSED' }],
        positions: [{ id: 'president', status: 'DECIDED', electedCandidateId: 'ana' }, { id: 'treasurer' }],
      },
    });
  });

  it('leaves the position waiting for a runoff when nobody has majority', () => {
    const election = electionVoting({ tally: { ana: 1, bia: 1, caio: 1 } });

    const result = closeRound(election, 'round-1');

    expect(result).toMatchObject({
      ok: true,
      value: { positions: [{ id: 'president', status: 'AWAITING_RUNOFF' }, { id: 'treasurer' }] },
    });
  });

  it('puts the position back at the front of the queue when there were no valid votes', () => {
    const election = electionVoting({ tally: {} });

    const result = closeRound(election, 'round-1');

    expect(result).toMatchObject({
      ok: true,
      value: { positions: [{ id: 'president', status: 'PENDING' }, { id: 'treasurer' }], queue: ['president', 'treasurer'] },
    });
  });

  it('rejects closing a round that is already closed', () => {
    const election = electionVoting({ status: 'CLOSED' });

    const result = closeRound(election, 'round-1');

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_OPEN' } });
  });

  it('rejects an unknown round', () => {
    const result = closeRound(electionVoting(), 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_NOT_FOUND' } });
  });
});

describe('closeRoundIfDue', () => {
  it('closes the open round once the deadline has passed', () => {
    const election = electionVoting({ tally: { ana: 1 } });

    const updated = closeRoundIfDue(election, fixedContext(secondsAfter(DEADLINE, 1)));

    expect(updated).toMatchObject({
      rounds: [{ status: 'CLOSED' }],
      positions: [{ status: 'DECIDED' }, { id: 'treasurer' }],
    });
  });

  it('keeps the round open at the exact deadline, when votes are still accepted', () => {
    const election = electionVoting();

    const updated = closeRoundIfDue(election, fixedContext(DEADLINE));

    expect(updated).toBe(election);
  });

  it('closes the round before the deadline when every eligible voter already voted', () => {
    const election = electionVoting({ tally: { bia: 2 }, votedVoterIds: ['voter-1', 'voter-2'] });

    const updated = closeRoundIfDue(election, fixedContext());

    expect(updated).toMatchObject({ rounds: [{ status: 'CLOSED' }] });
  });

  it('changes nothing when there is no open round', () => {
    const election = electionVoting({ status: 'CLOSED' });

    const updated = closeRoundIfDue(election, fixedContext(secondsAfter(DEADLINE, 1)));

    expect(updated).toBe(election);
  });
});

describe('castVote closing the round', () => {
  it('closes the round automatically when the last eligible voter votes', () => {
    const election = electionVoting({ tally: { ana: 1 }, votedVoterIds: ['voter-1'] });

    const result = castVote(election, { roundId: 'round-1', voterId: 'voter-2', choice: 'ana' }, fixedContext());

    expect(result).toMatchObject({
      ok: true,
      value: {
        rounds: [{ status: 'CLOSED' }],
        positions: [{ status: 'DECIDED', electedCandidateId: 'ana' }, { id: 'treasurer' }],
      },
    });
  });
});
