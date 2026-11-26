import { describe, expect, it } from 'vitest';
import { getRemainingSeconds } from '../src/lib/countdown';

describe('getRemainingSeconds', () => {
  it('rounds a future deadline up to the next whole second', () => {
    const remainingSeconds = getRemainingSeconds({
      deadline: '2026-11-26T12:00:20.250Z',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: '2026-11-26T12:00:00.000Z',
      clientNow: '2026-11-26T12:00:00.000Z',
    });

    expect(remainingSeconds).toBe(21);
  });

  it('returns zero at the exact deadline', () => {
    const remainingSeconds = getRemainingSeconds({
      deadline: '2026-11-26T12:00:00.000Z',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: '2026-11-26T12:00:00.000Z',
      clientNow: '2026-11-26T12:00:00.000Z',
    });

    expect(remainingSeconds).toBe(0);
  });

  it('does not return negative time after a deadline has passed', () => {
    const remainingSeconds = getRemainingSeconds({
      deadline: '2026-11-26T11:59:59.000Z',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: '2026-11-26T12:00:00.000Z',
      clientNow: '2026-11-26T12:00:00.000Z',
    });

    expect(remainingSeconds).toBe(0);
  });

  it('uses the server clock offset instead of the local wall clock', () => {
    const remainingSeconds = getRemainingSeconds({
      deadline: '2026-11-26T12:00:30.000Z',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: '2026-11-26T11:00:00.000Z',
      clientNow: '2026-11-26T11:00:10.000Z',
    });

    expect(remainingSeconds).toBe(20);
  });

  it.each([
    {
      deadline: 'not-an-iso-date',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: '2026-11-26T12:00:00.000Z',
      clientNow: '2026-11-26T12:00:00.000Z',
    },
    {
      deadline: '2026-11-26T12:00:30.000Z',
      serverNow: 'not-an-iso-date',
      clientNowAtSync: '2026-11-26T12:00:00.000Z',
      clientNow: '2026-11-26T12:00:00.000Z',
    },
    {
      deadline: '2026-11-26T12:00:30.000Z',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: 'not-an-iso-date',
      clientNow: '2026-11-26T12:00:00.000Z',
    },
    {
      deadline: '2026-11-26T12:00:30.000Z',
      serverNow: '2026-11-26T12:00:00.000Z',
      clientNowAtSync: '2026-11-26T12:00:00.000Z',
      clientNow: 'not-an-iso-date',
    },
  ])('rejects invalid date input', (clock) => {
    expect(() => getRemainingSeconds(clock)).toThrow(RangeError);
  });
});
