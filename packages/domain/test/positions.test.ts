import { describe, expect, it } from 'vitest';
import { addPosition, removePosition, updatePosition, type TiebreakRule } from '../src/index';
import { aCandidate, anElection, aPosition } from './builders/election-builder';
import { fixedContext } from './builders/fixed-context';

describe('addPosition', () => {
  it('adds a pending position at the end of the voting queue', () => {
    const election = anElection()
      .withPositions(aPosition({ id: 'president' }))
      .build();

    const result = addPosition(
      election,
      { title: 'Treasurer', tiebreak: 'YOUNGEST' },
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        positions: [
          { id: 'president' },
          { id: 'id-1', title: 'Treasurer', tiebreak: 'YOUNGEST', status: 'PENDING' },
        ],
        queue: ['president', 'id-1'],
      },
    });
  });

  it('trims spaces around the title', () => {
    const election = anElection().build();

    const result = addPosition(
      election,
      { title: '  Treasurer ', tiebreak: 'OLDEST' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: true, value: { positions: [{ title: 'Treasurer' }] } });
  });

  it('rejects a blank title', () => {
    const election = anElection().build();

    const result = addPosition(election, { title: ' ', tiebreak: 'OLDEST' }, fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_POSITION_TITLE' } });
  });

  it('rejects a title already used by another position, ignoring case', () => {
    const election = anElection()
      .withPositions(aPosition({ title: 'President' }))
      .build();

    const result = addPosition(
      election,
      { title: 'PRESIDENT', tiebreak: 'OLDEST' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_POSITION_TITLE' } });
  });

  it('rejects an unknown tiebreak rule', () => {
    const election = anElection().build();
    const unknownRule = 'TALLEST' as TiebreakRule;

    const result = addPosition(
      election,
      { title: 'Treasurer', tiebreak: unknownRule },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_TIEBREAK_RULE' } });
  });

  it('rejects new positions once the election is open', () => {
    const election = anElection().open().build();

    const result = addPosition(
      election,
      { title: 'Treasurer', tiebreak: 'OLDEST' },
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_NOT_DRAFT' } });
  });
});

describe('updatePosition', () => {
  it('changes the tiebreak rule of a pending position', () => {
    const election = anElection()
      .withPositions(aPosition({ id: 'president', tiebreak: 'OLDEST' }))
      .build();

    const result = updatePosition(election, 'president', { tiebreak: 'MOST_REMAINING_TIME' });

    expect(result).toMatchObject({
      ok: true,
      value: { positions: [{ title: 'President', tiebreak: 'MOST_REMAINING_TIME' }] },
    });
  });

  it('rejects renaming to the title of another position', () => {
    const election = anElection()
      .withPositions(
        aPosition({ id: 'president', title: 'President' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .build();

    const result = updatePosition(election, 'treasurer', { title: 'president' });

    expect(result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_POSITION_TITLE' } });
  });

  it('rejects an unknown position', () => {
    const election = anElection().build();

    const result = updatePosition(election, 'ghost', { title: 'Ghost' });

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects changes once the election is finished', () => {
    const election = anElection()
      .withStatus('FINISHED')
      .withPositions(aPosition({ id: 'president' }))
      .build();

    const result = updatePosition(election, 'president', { tiebreak: 'YOUNGEST' });

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });

  it('rejects changes to a position that already has an elected candidate', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president', status: 'DECIDED', electedCandidateId: 'ana' }))
      .build();

    const result = updatePosition(election, 'president', { tiebreak: 'YOUNGEST' });

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_PENDING' } });
  });
});

describe('removePosition', () => {
  it('removes the position from the election and from the queue', () => {
    const election = anElection()
      .withPositions(
        aPosition({ id: 'president', title: 'President' }),
        aPosition({ id: 'treasurer', title: 'Treasurer' }),
      )
      .build();

    const result = removePosition(election, 'president');

    expect(result).toMatchObject({
      ok: true,
      value: { positions: [{ id: 'treasurer' }], queue: ['treasurer'] },
    });
  });

  it('rejects removing an unknown position', () => {
    const election = anElection().build();

    const result = removePosition(election, 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects removing a position that candidates are running for', () => {
    const election = anElection()
      .withPositions(aPosition({ id: 'president' }))
      .withCandidates(aCandidate({ applications: ['president'] }))
      .build();

    const result = removePosition(election, 'president');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_HAS_CANDIDATES' } });
  });

  it('rejects removing positions once the election is open', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ id: 'president' }))
      .build();

    const result = removePosition(election, 'president');

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_NOT_DRAFT' } });
  });
});
