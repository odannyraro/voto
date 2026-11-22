import { describe, expect, it } from 'vitest';
import { rankByTiebreak } from '../src/index';
import { aCandidate } from './builders/election-builder';

const EARLIER = '2026-11-20T10:00:00.000Z';
const LATER = '2026-11-21T10:00:00.000Z';

describe('rankByTiebreak', () => {
  it('puts the youngest candidate first under YOUNGEST', () => {
    const older = aCandidate({ id: 'ana', age: 30 });
    const younger = aCandidate({ id: 'bia', age: 19 });

    const ranking = rankByTiebreak([older, younger], 'YOUNGEST');

    expect(ranking.map((candidate) => candidate.id)).toEqual(['bia', 'ana']);
  });

  it('puts the oldest candidate first under OLDEST', () => {
    const younger = aCandidate({ id: 'ana', age: 19 });
    const older = aCandidate({ id: 'bia', age: 30 });

    const ranking = rankByTiebreak([younger, older], 'OLDEST');

    expect(ranking.map((candidate) => candidate.id)).toEqual(['bia', 'ana']);
  });

  it('puts the candidate with more time left at the university first under MOST_REMAINING_TIME', () => {
    const leavingSoon = aCandidate({ id: 'ana', remainingMonths: 6 });
    const stayingLonger = aCandidate({ id: 'bia', remainingMonths: 36 });

    const ranking = rankByTiebreak([leavingSoon, stayingLonger], 'MOST_REMAINING_TIME');

    expect(ranking.map((candidate) => candidate.id)).toEqual(['bia', 'ana']);
  });

  it('falls back to the candidate registered first when the rule still ties', () => {
    const registeredLater = aCandidate({ id: 'ana', age: 22, createdAt: LATER });
    const registeredEarlier = aCandidate({ id: 'bia', age: 22, createdAt: EARLIER });

    const ranking = rankByTiebreak([registeredLater, registeredEarlier], 'OLDEST');

    expect(ranking.map((candidate) => candidate.id)).toEqual(['bia', 'ana']);
  });

  it('orders by id as a last resort, so the result never depends on input order', () => {
    const second = aCandidate({ id: 'bia', age: 22, createdAt: EARLIER });
    const first = aCandidate({ id: 'ana', age: 22, createdAt: EARLIER });

    const ranking = rankByTiebreak([second, first], 'YOUNGEST');

    expect(ranking.map((candidate) => candidate.id)).toEqual(['ana', 'bia']);
  });

  it('leaves the given list untouched', () => {
    const candidates = [aCandidate({ id: 'ana', age: 30 }), aCandidate({ id: 'bia', age: 19 })];

    rankByTiebreak(candidates, 'YOUNGEST');

    expect(candidates.map((candidate) => candidate.id)).toEqual(['ana', 'bia']);
  });
});
