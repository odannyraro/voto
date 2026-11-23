import { describe, expect, it } from 'vitest';
import { FakeClock } from './fake-clock';

const START = new Date('2026-01-01T10:00:00.000Z');
const ONE_SECOND_MS = 1000;
const HALF_SECOND_MS = 500;

describe('FakeClock', () => {
  it('starts at the given instant', () => {
    const clock = new FakeClock(START);

    expect(clock.now()).toEqual(START);
  });

  it('moves forward by the milliseconds passed to advance', () => {
    const clock = new FakeClock(START);

    clock.advance(ONE_SECOND_MS);

    expect(clock.now()).toEqual(new Date('2026-01-01T10:00:01.000Z'));
  });

  it('accumulates successive advances', () => {
    const clock = new FakeClock(START);

    clock.advance(ONE_SECOND_MS);
    clock.advance(HALF_SECOND_MS);

    expect(clock.now()).toEqual(new Date('2026-01-01T10:00:01.500Z'));
  });

  it('jumps to the instant given to set', () => {
    const clock = new FakeClock(START);

    clock.set(new Date('2026-06-15T08:30:00.000Z'));

    expect(clock.now()).toEqual(new Date('2026-06-15T08:30:00.000Z'));
  });

  it('is not moved by changes made to a date it returned', () => {
    const clock = new FakeClock(START);

    clock.now().setFullYear(1999);

    expect(clock.now()).toEqual(START);
  });
});
