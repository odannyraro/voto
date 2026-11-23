import { describe, expect, it } from 'vitest';
import {
  addCandidate,
  removeCandidate,
  updateCandidate,
  type AddCandidateInput,
} from '../src/index';
import { aCandidate, anElection, aPosition, aRound } from './builders/election-builder';
import { FIXED_NOW, fixedContext } from './builders/fixed-context';

const MIN_AGE = 16;
const MAX_AGE = 120;

/** Eleição com dois cargos, base dos testes de cadastro. */
function electionWithTwoPositions() {
  return anElection()
    .withPositions(
      aPosition({ id: 'president', title: 'President' }),
      aPosition({ id: 'treasurer', title: 'Treasurer' }),
    )
    .build();
}

/**
 * Dados válidos de candidatura; cada teste sobrescreve só o campo que importa.
 *
 * @param overrides - Campos a trocar.
 * @returns Os dados da candidatura.
 */
function candidacy(overrides: Partial<AddCandidateInput> = {}): AddCandidateInput {
  return {
    name: 'Ana',
    age: 22,
    remainingMonths: 24,
    applications: ['president', 'treasurer'],
    firstChoicePositionId: 'president',
    ...overrides,
  };
}

describe('addCandidate', () => {
  it('registers the candidate with the creation instant used as last tiebreak criterion', () => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ name: '  Ana ' }),
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        candidates: [
          {
            id: 'id-1',
            name: 'Ana',
            applications: ['president', 'treasurer'],
            firstChoicePositionId: 'president',
            createdAt: FIXED_NOW.toISOString(),
          },
        ],
      },
    });
  });

  it('accepts new candidates while the election is open', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president' }))
      .build();

    const result = addCandidate(
      election,
      candidacy({ applications: ['president'], firstChoicePositionId: 'president' }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: true, value: { candidates: [{ name: 'Ana' }] } });
  });

  it('rejects a blank name', () => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ name: '' }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CANDIDATE_NAME' } });
  });

  it.each([MIN_AGE, MAX_AGE])('accepts age %i at the limit', (age) => {
    const result = addCandidate(electionWithTwoPositions(), candidacy({ age }), fixedContext());

    expect(result).toMatchObject({ ok: true, value: { candidates: [{ age }] } });
  });

  it.each([MIN_AGE - 1, MAX_AGE + 1, 20.5])('rejects age %s', (age) => {
    const result = addCandidate(electionWithTwoPositions(), candidacy({ age }), fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CANDIDATE_AGE' } });
  });

  it('accepts a candidate in the last month at the university', () => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ remainingMonths: 0 }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: true, value: { candidates: [{ remainingMonths: 0 }] } });
  });

  it('rejects a negative remaining time at the university', () => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ remainingMonths: -1 }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REMAINING_MONTHS' } });
  });

  it.each([
    { label: 'no position', applications: [] },
    { label: 'the same position twice', applications: ['president', 'president'] },
  ])('rejects applications with $label', ({ applications }) => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ applications }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_APPLICATIONS' } });
  });

  it('rejects applications to a position that does not exist', () => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ applications: ['president', 'ghost'] }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects a first choice that is not among the applications', () => {
    const result = addCandidate(
      electionWithTwoPositions(),
      candidacy({ applications: ['president'], firstChoicePositionId: 'treasurer' }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_FIRST_CHOICE' } });
  });

  it('rejects new candidates after the election is finished', () => {
    const election = anElection()
      .withStatus('FINISHED')
      .withPositions(aPosition({ id: 'president' }))
      .build();

    const result = addCandidate(
      election,
      candidacy({ applications: ['president'] }),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });
});

describe('updateCandidate', () => {
  it('moves the first choice to another position the candidate applies to', () => {
    const election = anElection()
      .withPositions(
        aPosition({ id: 'president', title: 'President' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .withCandidates(
        aCandidate({
          id: 'ana',
          applications: ['president', 'treasurer'],
          firstChoicePositionId: 'president',
        }),
      )
      .build();

    const result = updateCandidate(election, 'ana', { firstChoicePositionId: 'treasurer' });

    expect(result).toMatchObject({
      ok: true,
      value: { candidates: [{ firstChoicePositionId: 'treasurer' }] },
    });
  });

  it('rejects dropping the application that is the first choice', () => {
    const election = anElection()
      .withPositions(
        aPosition({ id: 'president', title: 'President' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .withCandidates(
        aCandidate({
          id: 'ana',
          applications: ['president', 'treasurer'],
          firstChoicePositionId: 'president',
        }),
      )
      .build();

    const result = updateCandidate(election, 'ana', { applications: ['treasurer'] });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_FIRST_CHOICE' } });
  });

  it('trims spaces around the new name', () => {
    const election = anElection()
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate({ id: 'ana', name: 'Ana' }))
      .build();

    const result = updateCandidate(election, 'ana', { name: '  Ana Maria  ' });

    expect(result).toMatchObject({ ok: true, value: { candidates: [{ name: 'Ana Maria' }] } });
  });

  it('leaves the other candidates unchanged', () => {
    const election = anElection()
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(
        aCandidate({ id: 'ana', name: 'Ana' }),
        aCandidate({ id: 'bia', name: 'Bia' }),
      )
      .build();

    const result = updateCandidate(election, 'bia', { name: 'Bia Lima' });

    expect(result).toMatchObject({
      ok: true,
      value: {
        candidates: [
          { id: 'ana', name: 'Ana' },
          { id: 'bia', name: 'Bia Lima' },
        ],
      },
    });
  });

  it('rejects changes after the election is finished', () => {
    const election = anElection()
      .withStatus('FINISHED')
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .build();

    const result = updateCandidate(election, 'ana', { name: 'Ana Maria' });

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });

  it('rejects an unknown candidate', () => {
    const result = updateCandidate(electionWithTwoPositions(), 'ghost', { name: 'Ghost' });

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_NOT_FOUND' } });
  });

  it('rejects changes to a candidate who was already elected', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'DECIDED', electedCandidateId: 'ana' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .build();

    const result = updateCandidate(election, 'ana', { name: 'Ana Maria' });

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_ALREADY_ELECTED' } });
  });
});

describe('removeCandidate', () => {
  it('removes the candidate from the election', () => {
    const election = anElection()
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate({ id: 'ana' }), aCandidate({ id: 'bia', name: 'Bia' }))
      .build();

    const result = removeCandidate(election, 'ana');

    expect(result).toMatchObject({ ok: true, value: { candidates: [{ id: 'bia' }] } });
  });

  it('rejects removing a candidate who is on the ballot of the open round', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'VOTING' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .withRounds(aRound({ positionId: 'president', candidateIds: ['ana'], status: 'OPEN' }))
      .build();

    const result = removeCandidate(election, 'ana');

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_ON_BALLOT' } });
  });

  it('rejects removing a candidate who was already elected', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'DECIDED', electedCandidateId: 'ana' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .build();

    const result = removeCandidate(election, 'ana');

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_ALREADY_ELECTED' } });
  });

  it('rejects removing candidates after the election is finished', () => {
    const election = anElection()
      .withStatus('FINISHED')
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate({ id: 'ana' }))
      .build();

    const result = removeCandidate(election, 'ana');

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });

  it('rejects an unknown candidate', () => {
    const result = removeCandidate(electionWithTwoPositions(), 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'CANDIDATE_NOT_FOUND' } });
  });
});
