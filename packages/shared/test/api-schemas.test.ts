import { describe, expect, it } from 'vitest';
import {
  BLANK,
  cancelPositionBodySchema,
  castVoteBodySchema,
  createCandidateBodySchema,
  createElectionBodySchema,
  createPositionBodySchema,
  credentialVotersBodySchema,
  loginBodySchema,
  openRoundBodySchema,
  openRunoffBodySchema,
  queueBodySchema,
  updateCandidateBodySchema,
  updateElectionBodySchema,
  updatePositionBodySchema,
  voterSessionBodySchema,
} from '../src/index';

const aCandidate = {
  name: 'Ana',
  age: 30,
  remainingMonths: 12,
  applications: ['p1', 'p2'],
  firstChoicePositionId: 'p1',
};

describe('loginBodySchema', () => {
  it('accepts credentials and trims the username', () => {
    const result = loginBodySchema.safeParse({ username: '  admin ', password: 'secret' });

    expect(result).toEqual({ success: true, data: { username: 'admin', password: 'secret' } });
  });

  it('keeps the spaces of the password untouched', () => {
    const result = loginBodySchema.safeParse({ username: 'admin', password: ' secret ' });

    expect(result).toMatchObject({ success: true, data: { password: ' secret ' } });
  });

  it.each([
    ['an empty username', { username: '', password: 'secret' }],
    ['a blank username', { username: '   ', password: 'secret' }],
    ['an empty password', { username: 'admin', password: '' }],
    ['a missing password', { username: 'admin' }],
  ])('rejects %s', (_case, body) => {
    expect(loginBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('createElectionBodySchema', () => {
  it('accepts a name without voting seconds', () => {
    const result = createElectionBodySchema.safeParse({ name: ' Student Council ' });

    expect(result).toEqual({ success: true, data: { name: 'Student Council' } });
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a missing name', {}],
    ['voting seconds below the minimum', { name: 'Council', defaultVotingSeconds: 4 }],
    ['voting seconds above the maximum', { name: 'Council', defaultVotingSeconds: 3601 }],
    ['fractional voting seconds', { name: 'Council', defaultVotingSeconds: 30.5 }],
  ])('rejects %s', (_case, body) => {
    expect(createElectionBodySchema.safeParse(body).success).toBe(false);
  });

  it.each([5, 3600])('accepts %i voting seconds, a limit of the range', (seconds) => {
    const result = createElectionBodySchema.safeParse({
      name: 'Council',
      defaultVotingSeconds: seconds,
    });

    expect(result.success).toBe(true);
  });
});

describe('updateElectionBodySchema', () => {
  it('accepts a partial body with only the name', () => {
    const result = updateElectionBodySchema.safeParse({ name: 'Renamed' });

    expect(result).toEqual({ success: true, data: { name: 'Renamed' } });
  });

  it('accepts a partial body with only the voting seconds', () => {
    const result = updateElectionBodySchema.safeParse({ defaultVotingSeconds: 60 });

    expect(result).toEqual({ success: true, data: { defaultVotingSeconds: 60 } });
  });

  it('rejects an empty name', () => {
    expect(updateElectionBodySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects voting seconds out of range', () => {
    expect(updateElectionBodySchema.safeParse({ defaultVotingSeconds: 3601 }).success).toBe(false);
  });
});

describe('createPositionBodySchema', () => {
  it('accepts a title and a tiebreak rule', () => {
    const result = createPositionBodySchema.safeParse({
      title: ' President ',
      tiebreak: 'YOUNGEST',
    });

    expect(result).toEqual({ success: true, data: { title: 'President', tiebreak: 'YOUNGEST' } });
  });

  it.each(['YOUNGEST', 'OLDEST', 'MOST_REMAINING_TIME'])('accepts the %s tiebreak', (tiebreak) => {
    expect(createPositionBodySchema.safeParse({ title: 'President', tiebreak }).success).toBe(true);
  });

  it.each([
    ['an unknown tiebreak', { title: 'President', tiebreak: 'RANDOM' }],
    ['a missing tiebreak', { title: 'President' }],
    ['a blank title', { title: '  ', tiebreak: 'OLDEST' }],
  ])('rejects %s', (_case, body) => {
    expect(createPositionBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('updatePositionBodySchema', () => {
  it('accepts a partial body with only the tiebreak', () => {
    const result = updatePositionBodySchema.safeParse({ tiebreak: 'OLDEST' });

    expect(result).toEqual({ success: true, data: { tiebreak: 'OLDEST' } });
  });

  it('rejects an empty title', () => {
    expect(updatePositionBodySchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('queueBodySchema', () => {
  it('accepts an ordered list of position ids', () => {
    const result = queueBodySchema.safeParse({ positionIds: ['p2', 'p1'] });

    expect(result).toEqual({ success: true, data: { positionIds: ['p2', 'p1'] } });
  });

  it('rejects an empty id in the list', () => {
    expect(queueBodySchema.safeParse({ positionIds: ['p1', ''] }).success).toBe(false);
  });

  it('rejects a missing list', () => {
    expect(queueBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('createCandidateBodySchema', () => {
  it('accepts a candidate whose first choice is among the applications', () => {
    const result = createCandidateBodySchema.safeParse(aCandidate);

    expect(result).toEqual({ success: true, data: aCandidate });
  });

  it('rejects a first choice that is not among the applications', () => {
    const result = createCandidateBodySchema.safeParse({
      ...aCandidate,
      firstChoicePositionId: 'p3',
    });

    expect(result.error?.issues[0]?.path).toEqual(['firstChoicePositionId']);
  });

  it.each([16, 120])('accepts age %i, a limit of the range', (age) => {
    expect(createCandidateBodySchema.safeParse({ ...aCandidate, age }).success).toBe(true);
  });

  it.each([15, 121, 30.5])('rejects age %s', (age) => {
    expect(createCandidateBodySchema.safeParse({ ...aCandidate, age }).success).toBe(false);
  });

  it('accepts zero remaining months', () => {
    const result = createCandidateBodySchema.safeParse({ ...aCandidate, remainingMonths: 0 });

    expect(result.success).toBe(true);
  });

  it.each([-1, 1.5])('rejects %s remaining months', (remainingMonths) => {
    const result = createCandidateBodySchema.safeParse({ ...aCandidate, remainingMonths });

    expect(result.success).toBe(false);
  });

  it('rejects a candidate with no applications', () => {
    const result = createCandidateBodySchema.safeParse({ ...aCandidate, applications: [] });

    expect(result.success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(createCandidateBodySchema.safeParse({ ...aCandidate, name: ' ' }).success).toBe(false);
  });
});

describe('updateCandidateBodySchema', () => {
  it('accepts a partial body with only the age', () => {
    expect(updateCandidateBodySchema.safeParse({ age: 40 })).toEqual({
      success: true,
      data: { age: 40 },
    });
  });

  it('accepts a first choice among the applications sent together', () => {
    const result = updateCandidateBodySchema.safeParse({
      applications: ['p1', 'p2'],
      firstChoicePositionId: 'p2',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a first choice outside the applications sent together', () => {
    const result = updateCandidateBodySchema.safeParse({
      applications: ['p1'],
      firstChoicePositionId: 'p2',
    });

    expect(result.error?.issues[0]?.path).toEqual(['firstChoicePositionId']);
  });

  it('rejects an age out of range', () => {
    expect(updateCandidateBodySchema.safeParse({ age: 15 }).success).toBe(false);
  });
});

describe('credentialVotersBodySchema', () => {
  it('accepts a count with optional labels', () => {
    const result = credentialVotersBodySchema.safeParse({
      count: 2,
      labels: ['Desk 1', ' Desk 2'],
    });

    expect(result).toEqual({ success: true, data: { count: 2, labels: ['Desk 1', 'Desk 2'] } });
  });

  it('accepts a count without labels', () => {
    expect(credentialVotersBodySchema.safeParse({ count: 3 })).toEqual({
      success: true,
      data: { count: 3 },
    });
  });

  it.each([1, 500])('accepts count %i, a limit of the range', (count) => {
    expect(credentialVotersBodySchema.safeParse({ count }).success).toBe(true);
  });

  it.each([0, 501, 2.5, -1])('rejects count %s', (count) => {
    expect(credentialVotersBodySchema.safeParse({ count }).success).toBe(false);
  });

  it('rejects a blank label', () => {
    expect(credentialVotersBodySchema.safeParse({ count: 1, labels: [' '] }).success).toBe(false);
  });
});

describe('openRoundBodySchema', () => {
  it('accepts a position id without duration', () => {
    expect(openRoundBodySchema.safeParse({ positionId: 'p1' })).toEqual({
      success: true,
      data: { positionId: 'p1' },
    });
  });

  it('accepts a position id with duration', () => {
    const result = openRoundBodySchema.safeParse({ positionId: 'p1', durationSeconds: 90 });

    expect(result).toEqual({ success: true, data: { positionId: 'p1', durationSeconds: 90 } });
  });

  it('rejects a missing position id', () => {
    expect(openRoundBodySchema.safeParse({ durationSeconds: 90 }).success).toBe(false);
  });

  it.each([5, 3600])('accepts %i seconds, a limit of the range', (durationSeconds) => {
    expect(openRoundBodySchema.safeParse({ positionId: 'p1', durationSeconds }).success).toBe(true);
  });

  it.each([4, 3601, 10.5])('rejects %s seconds', (durationSeconds) => {
    expect(openRoundBodySchema.safeParse({ positionId: 'p1', durationSeconds }).success).toBe(
      false,
    );
  });
});

describe('openRunoffBodySchema', () => {
  it('accepts an empty body', () => {
    expect(openRunoffBodySchema.safeParse({})).toEqual({ success: true, data: {} });
  });

  it('accepts a duration', () => {
    expect(openRunoffBodySchema.safeParse({ durationSeconds: 60 })).toEqual({
      success: true,
      data: { durationSeconds: 60 },
    });
  });

  it.each([4, 3601])('rejects %s seconds', (durationSeconds) => {
    expect(openRunoffBodySchema.safeParse({ durationSeconds }).success).toBe(false);
  });
});

describe('cancelPositionBodySchema', () => {
  it('accepts the confirmation title', () => {
    expect(cancelPositionBodySchema.safeParse({ confirmTitle: ' President ' })).toEqual({
      success: true,
      data: { confirmTitle: 'President' },
    });
  });

  it.each([{}, { confirmTitle: '' }])('rejects the body %j', (body) => {
    expect(cancelPositionBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('voterSessionBodySchema', () => {
  it('normalizes the code to uppercase without surrounding spaces', () => {
    const result = voterSessionBodySchema.safeParse({ code: ' abcd2345 ' });

    expect(result).toEqual({ success: true, data: { code: 'ABCD2345' } });
  });

  it.each(['ABCD234', 'ABCD23456', ''])('rejects the code "%s" for its length', (code) => {
    expect(voterSessionBodySchema.safeParse({ code }).success).toBe(false);
  });
});

describe('castVoteBodySchema', () => {
  it('accepts a vote for a candidate', () => {
    expect(castVoteBodySchema.safeParse({ roundId: 'r1', choice: 'c1' })).toEqual({
      success: true,
      data: { roundId: 'r1', choice: 'c1' },
    });
  });

  it('accepts a blank vote', () => {
    const result = castVoteBodySchema.safeParse({ roundId: 'r1', choice: BLANK });

    expect(result.success).toBe(true);
  });

  it.each([
    ['an empty choice', { roundId: 'r1', choice: '' }],
    ['a missing choice', { roundId: 'r1' }],
    ['a missing round', { choice: 'c1' }],
  ])('rejects %s', (_case, body) => {
    expect(castVoteBodySchema.safeParse(body).success).toBe(false);
  });
});
