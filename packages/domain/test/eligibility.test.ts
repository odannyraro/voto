import { describe, expect, it } from 'vitest';
import { attachableCandidates, attachExistingCandidate, eligibleCandidates } from '../src/index';
import { aCandidate, anElection, aPosition } from './builders/election-builder';

const president = aPosition({ id: 'president', title: 'President' });
const treasurer = aPosition({ id: 'treasurer', title: 'Treasurer' });

describe('eligibleCandidates', () => {
  it('lists only the candidates running for the position', () => {
    const election = anElection()
      .withPositions(president, treasurer)
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president'] }),
        aCandidate({ id: 'bia', applications: ['treasurer'] }),
      )
      .build();

    const eligible = eligibleCandidates(election, 'president');

    expect(eligible.map((candidate) => candidate.id)).toEqual(['ana']);
  });

  it('leaves out a candidate already elected to another position', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ ...president, status: 'DECIDED', electedCandidateId: 'ana' }),
        treasurer,
      )
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president', 'treasurer'] }),
        aCandidate({ id: 'bia', applications: ['treasurer'] }),
      )
      .build();

    const eligible = eligibleCandidates(election, 'treasurer');

    expect(eligible.map((candidate) => candidate.id)).toEqual(['bia']);
  });
});

describe('attachableCandidates', () => {
  it('lists unelected candidates who are not running for the position yet', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ ...president, status: 'DECIDED', electedCandidateId: 'ana' }),
        treasurer,
      )
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president'] }),
        aCandidate({ id: 'bia', applications: ['president'] }),
        aCandidate({ id: 'caio', applications: ['treasurer'] }),
      )
      .build();

    const attachable = attachableCandidates(election, 'treasurer');

    expect(attachable.map((candidate) => candidate.id)).toEqual(['bia']);
  });
});

describe('attachExistingCandidate', () => {
  it('adds the position to the applications of the candidate', () => {
    const election = anElection()
      .open()
      .withPositions(president, treasurer)
      .withCandidates(aCandidate({ id: 'ana', applications: ['president'] }))
      .build();

    const result = attachExistingCandidate(election, 'treasurer', 'ana');

    expect(result).toMatchObject({
      ok: true,
      value: {
        candidates: [
          {
            id: 'ana',
            applications: ['president', 'treasurer'],
            firstChoicePositionId: 'president',
          },
        ],
      },
    });
  });

  it('does not list the position twice when the candidate already runs for it', () => {
    const election = anElection()
      .open()
      .withPositions(president)
      .withCandidates(aCandidate({ id: 'ana', applications: ['president'] }))
      .build();

    const result = attachExistingCandidate(election, 'president', 'ana');

    expect(result).toMatchObject({
      ok: true,
      value: { candidates: [{ applications: ['president'] }] },
    });
  });

  it('rejects a candidate who was already elected', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ ...president, status: 'DECIDED', electedCandidateId: 'ana' }),
        treasurer,
      )
      .withCandidates(aCandidate({ id: 'ana', applications: ['president'] }))
      .build();

    const result = attachExistingCandidate(election, 'treasurer', 'ana');

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_ALREADY_ELECTED' } });
  });

  it('rejects an unknown candidate', () => {
    const election = anElection().open().withPositions(treasurer).build();

    const result = attachExistingCandidate(election, 'treasurer', 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_NOT_FOUND' } });
  });

  it('rejects an unknown position', () => {
    const election = anElection()
      .open()
      .withCandidates(aCandidate({ id: 'ana' }))
      .build();

    const result = attachExistingCandidate(election, 'ghost', 'ana');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects a position that is no longer waiting to be voted', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...treasurer, status: 'CANCELLED' }))
      .withCandidates(aCandidate({ id: 'ana', applications: ['president'] }))
      .build();

    const result = attachExistingCandidate(election, 'treasurer', 'ana');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_PENDING' } });
  });
});
