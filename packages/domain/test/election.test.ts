import { describe, expect, it } from 'vitest';
import { createElection, DEFAULT_VOTING_SECONDS, updateElection } from '../src/index';
import { anElection } from './builders/election-builder';
import { fixedContext } from './builders/fixed-context';

const MIN_VOTING_SECONDS = 5;
const MAX_VOTING_SECONDS = 3600;

describe('createElection', () => {
  it('creates an empty draft election owned by the admin', () => {
    const result = createElection(
      { adminId: 'admin-1', name: 'Student Union 2027' },
      fixedContext(),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'id-1',
        adminId: 'admin-1',
        name: 'Student Union 2027',
        status: 'DRAFT',
        defaultVotingSeconds: DEFAULT_VOTING_SECONDS,
        positions: [],
        queue: [],
        candidates: [],
        voters: [],
        rounds: [],
        version: 0,
      },
    });
  });

  it('trims spaces around the election name', () => {
    const result = createElection({ adminId: 'admin-1', name: '  Board  ' }, fixedContext());

    expect(result).toMatchObject({ ok: true, value: { name: 'Board' } });
  });

  it('rejects a blank election name', () => {
    const result = createElection({ adminId: 'admin-1', name: '   ' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_ELECTION_NAME' } });
  });

  it.each([
    { seconds: MIN_VOTING_SECONDS, label: 'the minimum' },
    { seconds: MAX_VOTING_SECONDS, label: 'the maximum' },
  ])('accepts $label voting duration', ({ seconds }) => {
    const result = createElection(
      { adminId: 'admin-1', name: 'Board', defaultVotingSeconds: seconds },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: true, value: { defaultVotingSeconds: seconds } });
  });

  it.each([
    { seconds: MIN_VOTING_SECONDS - 1, label: 'below the minimum' },
    { seconds: MAX_VOTING_SECONDS + 1, label: 'above the maximum' },
    { seconds: 30.5, label: 'not a whole number' },
  ])('rejects a voting duration $label', ({ seconds }) => {
    const result = createElection(
      { adminId: 'admin-1', name: 'Board', defaultVotingSeconds: seconds },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_VOTING_DURATION' } });
  });
});

describe('updateElection', () => {
  it('renames the election and keeps the other settings', () => {
    const election = anElection().build();

    const result = updateElection(election, { name: 'Board 2027' });

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Board 2027', defaultVotingSeconds: election.defaultVotingSeconds },
    });
  });

  it('rejects renaming the election to a blank name', () => {
    const election = anElection().build();

    const result = updateElection(election, { name: ' ' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_ELECTION_NAME' } });
  });

  it('changes the default voting duration', () => {
    const election = anElection().build();

    const result = updateElection(election, { defaultVotingSeconds: 90 });

    expect(result).toMatchObject({ ok: true, value: { defaultVotingSeconds: 90 } });
  });

  it('rejects an invalid voting duration', () => {
    const election = anElection().build();

    const result = updateElection(election, { defaultVotingSeconds: 0 });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_VOTING_DURATION' } });
  });

  it('rejects changes to a finished election', () => {
    const election = anElection().withStatus('FINISHED').build();

    const result = updateElection(election, { name: 'Too late' });

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });
});
