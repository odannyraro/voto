import { describe, expect, it } from 'vitest';
import { formatTiebreakRule, formatVotePercentage } from '../src/lib/format';

describe('formatVotePercentage', () => {
  it('returns zero percent when there are no valid votes', () => {
    expect(formatVotePercentage(0, 0)).toBe('0%');
  });

  it('rounds percentages to the nearest whole number', () => {
    expect(formatVotePercentage(1, 3)).toBe('33%');
  });

  it('rounds a half percentage upward', () => {
    expect(formatVotePercentage(1, 8)).toBe('13%');
  });

  it('returns the exact percentage for unanimous valid votes', () => {
    expect(formatVotePercentage(4, 4)).toBe('100%');
  });

  it.each([
    [-1, 3],
    [1, -3],
    [1.5, 3],
    [1, 3.5],
    [4, 3],
    [1, 0],
  ])('rejects invalid vote counts: %i of %i', (votes, validVotes) => {
    expect(() => formatVotePercentage(votes, validVotes)).toThrow(RangeError);
  });
});

describe('formatTiebreakRule', () => {
  it.each([
    ['YOUNGEST', 'Youngest candidate'],
    ['OLDEST', 'Oldest candidate'],
    ['MOST_REMAINING_TIME', 'Most remaining time'],
  ] as const)('formats %s as a readable label', (rule, label) => {
    expect(formatTiebreakRule(rule)).toBe(label);
  });
});
