import { describe, expect, it } from 'vitest';
import { computeResult } from '../src/index';
import { aCandidate, aPosition, aRound } from './builders/election-builder';

// Regra de desempate OLDEST: Dani (40) > Ana (30) > Bia (25) > Caio (20).
const position = aPosition({ id: 'president', tiebreak: 'OLDEST' });
const candidates = [
  aCandidate({ id: 'ana', age: 30 }),
  aCandidate({ id: 'bia', age: 25 }),
  aCandidate({ id: 'caio', age: 20 }),
  aCandidate({ id: 'dani', age: 40 }),
];

describe('computeResult runoff cut', () => {
  it('sends the two leaders to the runoff without a tiebreak when they tie at the top', () => {
    const round = aRound({ status: 'CLOSED', candidateIds: ['ana', 'bia', 'caio'], tally: { ana: 2, bia: 2, caio: 1 } });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ runoffCandidateIds: ['ana', 'bia'], tiebreakApplied: false });
  });

  it('picks two of three candidates tied at the top using the position rule', () => {
    const round = aRound({ status: 'CLOSED', candidateIds: ['caio', 'bia', 'ana'], tally: { ana: 2, bia: 2, caio: 2 } });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({
      outcome: 'RUNOFF_REQUIRED',
      runoffCandidateIds: ['ana', 'bia'],
      tiebreakApplied: true,
    });
  });

  it('breaks a tie for second place only among the tied candidates', () => {
    const round = aRound({
      status: 'CLOSED',
      candidateIds: ['ana', 'caio', 'bia', 'dani'],
      tally: { ana: 3, caio: 2, bia: 2, dani: 1 },
    });

    const result = computeResult(round, position, candidates);

    expect(result).toMatchObject({ runoffCandidateIds: ['ana', 'bia'], tiebreakApplied: true });
  });
});
