import { describe, expect, it } from 'vitest';
import { cancelPosition, deferPosition } from '../src/index';
import { anElection, aPosition } from './builders/election-builder';

const president = aPosition({ id: 'president', title: 'President' });
const treasurer = aPosition({ id: 'treasurer', title: 'Treasurer' });
const secretary = aPosition({ id: 'secretary', title: 'Secretary' });

describe('deferPosition', () => {
  it('moves the position to the end of the queue', () => {
    const election = anElection().open().withPositions(president, treasurer, secretary).build();

    const result = deferPosition(election, 'president');

    expect(result).toMatchObject({
      ok: true,
      value: { queue: ['treasurer', 'secretary', 'president'] },
    });
  });

  it('rejects deferring a position that is not waiting in the queue', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...president, status: 'DECIDED' }))
      .build();

    const result = deferPosition(election, 'president');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_PENDING' } });
  });

  it('rejects an unknown position', () => {
    const election = anElection().open().withPositions(president).build();

    const result = deferPosition(election, 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_FOUND' } });
  });
});

describe('cancelPosition', () => {
  it('cancels the position and takes it out of the queue when the title is confirmed', () => {
    const election = anElection().open().withPositions(president, treasurer).build();

    const result = cancelPosition(election, 'president', 'President');

    expect(result).toMatchObject({
      ok: true,
      value: {
        positions: [{ id: 'president', status: 'CANCELLED' }, { id: 'treasurer' }],
        queue: ['treasurer'],
      },
    });
  });

  it('can cancel a position that was waiting for a runoff', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...president, status: 'AWAITING_RUNOFF' }))
      .build();

    const result = cancelPosition(election, 'president', 'President');

    expect(result).toMatchObject({ ok: true, value: { positions: [{ status: 'CANCELLED' }] } });
  });

  it.each([
    { label: 'a different title', typed: 'Treasurer' },
    { label: 'the title in another case', typed: 'president' },
    { label: 'an empty confirmation', typed: '' },
  ])('rejects $label as confirmation', ({ typed }) => {
    const election = anElection().open().withPositions(president, treasurer).build();

    const result = cancelPosition(election, 'president', typed);

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_MISMATCH' } });
  });

  it('rejects cancelling a position whose round is in progress', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...president, status: 'VOTING' }))
      .build();

    const result = cancelPosition(election, 'president', 'President');

    expect(result).toMatchObject({ ok: false, error: { code: 'POSITION_NOT_PENDING' } });
  });
});
