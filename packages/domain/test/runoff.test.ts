import { describe, expect, it } from 'vitest';
import { BLANK, closeRound, openRunoff, type Round } from '../src/index';
import { aCandidate, anElection, aPosition, aRound, aVoter } from './builders/election-builder';
import { fixedContext } from './builders/fixed-context';

// Desempate OLDEST: Ana (30) > Bia (25) > Caio (20).
const candidates = [
  aCandidate({ id: 'ana', age: 30 }),
  aCandidate({ id: 'bia', name: 'Bia', age: 25 }),
  aCandidate({ id: 'caio', name: 'Caio', age: 20 }),
];

const firstRoundWithoutMajority = aRound({
  id: 'first-round',
  candidateIds: ['ana', 'bia', 'caio'],
  eligibleVoterIds: ['voter-1'],
  tally: { caio: 2, bia: 2, ana: 1 },
  status: 'CLOSED',
});

/** Eleição aberta em que o 1º turno de President terminou sem maioria (Caio e Bia na frente). */
function electionAwaitingRunoff() {
  return anElection()
    .open()
    .withPositions(aPosition({ id: 'president', status: 'AWAITING_RUNOFF', tiebreak: 'OLDEST' }))
    .withCandidates(...candidates)
    .withVoters(aVoter({ id: 'voter-1' }))
    .withRounds(firstRoundWithoutMajority)
    .build();
}

/**
 * Eleição com o 2º turno de President aberto entre Bia e Caio (ordem da cédula).
 *
 * @param runoff - Campos da rodada de 2º turno a sobrescrever (normalmente a contagem).
 * @returns A eleição.
 */
function electionInRunoff(runoff: Partial<Round>) {
  return anElection()
    .open()
    .withPositions(aPosition({ id: 'president', status: 'VOTING', tiebreak: 'OLDEST' }))
    .withCandidates(...candidates)
    .withVoters(aVoter({ id: 'voter-1' }), aVoter({ id: 'voter-2', code: 'BBBB3333' }))
    .withRounds(
      firstRoundWithoutMajority,
      aRound({ id: 'runoff', kind: 'RUNOFF', candidateIds: ['bia', 'caio'], eligibleVoterIds: ['voter-1', 'voter-2'], ...runoff }),
    )
    .build();
}

describe('openRunoff', () => {
  it('opens a runoff round with the two finalists of the first round', () => {
    const result = openRunoff(electionAwaitingRunoff(), { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({
      ok: true,
      value: {
        positions: [{ status: 'VOTING' }],
        rounds: [{ id: 'first-round' }, { id: 'id-1', kind: 'RUNOFF', candidateIds: ['bia', 'caio'], status: 'OPEN' }],
      },
    });
  });

  it('rejects a position that is not waiting for a runoff', () => {
    const election = anElection().open().withPositions(aPosition({ id: 'president' })).build();

    const result = openRunoff(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_AWAITING_RUNOFF' } });
  });

  it('rejects an unknown position', () => {
    const result = openRunoff(electionAwaitingRunoff(), { positionId: 'ghost' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects a runoff while another round is open', () => {
    const election = electionInRunoff({});

    const result = openRunoff(election, { positionId: 'president' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_IN_PROGRESS' } });
  });
});

describe('closing a runoff', () => {
  it('elects the most voted finalist', () => {
    const election = electionInRunoff({ tally: { bia: 2, caio: 1 } });

    const result = closeRound(election, 'runoff');

    expect(result).toMatchObject({ ok: true, value: { positions: [{ status: 'DECIDED', electedCandidateId: 'bia' }] } });
  });

  it('breaks a tie between the finalists with the position rule', () => {
    const election = electionInRunoff({ tally: { bia: 1, caio: 1 } });

    const result = closeRound(election, 'runoff');

    expect(result).toMatchObject({ ok: true, value: { positions: [{ status: 'DECIDED', electedCandidateId: 'bia' }] } });
  });

  it('keeps the position waiting for a runoff when the runoff had no valid votes', () => {
    const election = electionInRunoff({ tally: { [BLANK]: 2 } });

    const result = closeRound(election, 'runoff');

    expect(result).toMatchObject({ ok: true, value: { positions: [{ status: 'AWAITING_RUNOFF' }], queue: [] } });
  });
});
