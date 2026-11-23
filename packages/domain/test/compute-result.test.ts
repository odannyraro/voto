import { describe, expect, it } from 'vitest';
import { BLANK, computeResult } from '../src/index';
import { aCandidate, aPosition, aRound } from './builders/election-builder';

const position = aPosition({ id: 'president', tiebreak: 'OLDEST' });
const ana = aCandidate({ id: 'ana', name: 'Ana', age: 30 });
const bia = aCandidate({ id: 'bia', name: 'Bia', age: 25 });
const caio = aCandidate({ id: 'caio', name: 'Caio', age: 20 });
const candidates = [ana, bia, caio];

/**
 * Rodada fechada de 1º turno com a cédula e a contagem dadas.
 *
 * @param candidateIds - Cédula congelada.
 * @param tally - Votos por candidato (e `BLANK`).
 * @returns A rodada pronta para apurar.
 */
function closedRound(candidateIds: string[], tally: Record<string, number>) {
  return aRound({ candidateIds, tally, status: 'CLOSED' });
}

describe('computeResult', () => {
  it('reports votes per candidate from most to least voted, with blank votes apart', () => {
    const round = closedRound(['ana', 'bia', 'caio'], { bia: 3, ana: 1, [BLANK]: 2 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({
      counts: [
        { candidateId: 'bia', votes: 3 },
        { candidateId: 'ana', votes: 1 },
        { candidateId: 'caio', votes: 0 },
      ],
      blank: 2,
      validVotes: 4,
    });
  });

  it('elects the candidate with one vote more than half of the valid votes', () => {
    const round = closedRound(['ana', 'bia', 'caio'], { ana: 4, bia: 2, caio: 1 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'ELECTED', electedCandidateId: 'ana', tiebreakApplied: false });
  });

  it('requires a runoff when the leader has exactly half of the valid votes', () => {
    const round = closedRound(['ana', 'bia', 'caio'], { ana: 3, bia: 2, caio: 1 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'RUNOFF_REQUIRED', runoffCandidateIds: ['ana', 'bia'] });
  });

  it('ignores blank votes when checking the majority', () => {
    const round = closedRound(['ana', 'bia', 'caio'], { ana: 2, bia: 1, [BLANK]: 5 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'ELECTED', electedCandidateId: 'ana' });
  });

  it('elects the most voted of two candidates', () => {
    const round = closedRound(['ana', 'bia'], { ana: 1, bia: 2 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'ELECTED', electedCandidateId: 'bia' });
  });

  it('breaks a tie between two candidates with the position rule instead of a runoff', () => {
    const round = closedRound(['bia', 'ana'], { ana: 2, bia: 2 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'ELECTED', electedCandidateId: 'ana', tiebreakApplied: true });
  });

  it('elects a single candidate with at least one valid vote', () => {
    const round = closedRound(['caio'], { caio: 1, [BLANK]: 4 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'ELECTED', electedCandidateId: 'caio' });
  });

  it('reports no valid votes when everybody voted blank', () => {
    const round = closedRound(['ana', 'bia', 'caio'], { [BLANK]: 3 });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ outcome: 'NO_VALID_VOTES', validVotes: 0 });
  });

  it('refuses to count a round that is still open', () => {
    const round = aRound({ candidateIds: ['ana'], status: 'OPEN' });

    expect(() => computeResult(round, position, candidates)).toThrow(/still open/);
  });
});
