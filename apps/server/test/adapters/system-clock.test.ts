import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../../src/adapters/system-clock';

afterEach(() => {
  vi.useRealTimers();
});

describe('systemClock', () => {
  it('tells the current time of the machine', () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T09:30:00.000Z') });

    const now = systemClock.now();

    expect(now).toEqual(new Date('2026-03-01T09:30:00.000Z'));
  });
});
