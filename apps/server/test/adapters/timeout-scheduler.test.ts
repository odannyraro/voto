import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutScheduler } from '../../src/adapters/timeout-scheduler';

const START = new Date('2026-01-01T12:00:00.000Z');
const TEN_SECONDS_MS = 10_000;
// Maior atraso que o `setTimeout` aceita; acima disso o Node dispara na hora.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
const ONE_SECOND_MS = 1000;

/**
 * Instante `ms` milissegundos depois do relógio simulado.
 *
 * @param ms - Distância a partir de agora.
 * @returns O instante correspondente.
 */
function inMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe('TimeoutScheduler', () => {
  let scheduler: TimeoutScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    scheduler = new TimeoutScheduler();
  });

  afterEach(() => {
    scheduler.cancelAll();
    vi.useRealTimers();
  });

  describe('schedule', () => {
    it('does not run the task one millisecond before its moment', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(TEN_SECONDS_MS), 'k', task);

      vi.advanceTimersByTime(TEN_SECONDS_MS - 1);

      expect(task).not.toHaveBeenCalled();
    });

    it('runs the task exactly when its moment arrives', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(TEN_SECONDS_MS), 'k', task);

      vi.advanceTimersByTime(TEN_SECONDS_MS);

      expect(task).toHaveBeenCalledOnce();
    });

    it('runs the task right away when its moment has already passed', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(-TEN_SECONDS_MS), 'k', task);

      vi.advanceTimersByTime(0);

      expect(task).toHaveBeenCalledOnce();
    });

    it('runs the task only once', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'k', task);

      vi.advanceTimersByTime(TEN_SECONDS_MS);

      expect(task).toHaveBeenCalledOnce();
    });

    it('replaces the task of the same key', () => {
      const replaced = vi.fn();
      const replacement = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'k', replaced);
      scheduler.schedule(inMs(ONE_SECOND_MS), 'k', replacement);

      vi.advanceTimersByTime(ONE_SECOND_MS);

      expect({
        replaced: replaced.mock.calls.length,
        replacement: replacement.mock.calls.length,
      }).toEqual({ replaced: 0, replacement: 1 });
    });

    it('keeps tasks of different keys independent', () => {
      const first = vi.fn();
      const second = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'a', first);
      scheduler.schedule(inMs(ONE_SECOND_MS), 'b', second);

      vi.advanceTimersByTime(ONE_SECOND_MS);

      expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
    });

    it('lets a task schedule its own key again once it has run', () => {
      const again = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'k', () => {
        scheduler.schedule(inMs(ONE_SECOND_MS), 'k', again);
      });

      vi.advanceTimersByTime(2 * ONE_SECOND_MS);

      expect(again).toHaveBeenCalledOnce();
    });

    it('does not fire early when the delay exceeds what a timer can hold', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(MAX_TIMER_DELAY_MS + ONE_SECOND_MS), 'k', task);

      vi.advanceTimersByTime(MAX_TIMER_DELAY_MS);

      expect(task).not.toHaveBeenCalled();
    });

    it('fires at the requested moment when the delay exceeds what a timer can hold', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(MAX_TIMER_DELAY_MS + ONE_SECOND_MS), 'k', task);

      vi.advanceTimersByTime(MAX_TIMER_DELAY_MS + ONE_SECOND_MS);

      expect(task).toHaveBeenCalledOnce();
    });
  });

  describe('cancel', () => {
    it('prevents the task from running', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'k', task);

      scheduler.cancel('k');
      vi.advanceTimersByTime(TEN_SECONDS_MS);

      expect(task).not.toHaveBeenCalled();
    });

    it('prevents a task whose delay was split from running', () => {
      const task = vi.fn();
      scheduler.schedule(inMs(MAX_TIMER_DELAY_MS + ONE_SECOND_MS), 'k', task);
      vi.advanceTimersByTime(MAX_TIMER_DELAY_MS);

      scheduler.cancel('k');
      vi.advanceTimersByTime(TEN_SECONDS_MS);

      expect(task).not.toHaveBeenCalled();
    });

    it('does nothing for a key that has no task', () => {
      expect(() => scheduler.cancel('missing')).not.toThrow();
    });

    it('leaves the tasks of other keys alone', () => {
      const kept = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'cancelled', vi.fn());
      scheduler.schedule(inMs(ONE_SECOND_MS), 'kept', kept);

      scheduler.cancel('cancelled');
      vi.advanceTimersByTime(ONE_SECOND_MS);

      expect(kept).toHaveBeenCalledOnce();
    });
  });

  describe('cancelAll', () => {
    it('prevents every pending task from running', () => {
      const first = vi.fn();
      const second = vi.fn();
      scheduler.schedule(inMs(ONE_SECOND_MS), 'a', first);
      scheduler.schedule(inMs(ONE_SECOND_MS), 'b', second);

      scheduler.cancelAll();
      vi.advanceTimersByTime(TEN_SECONDS_MS);

      expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 0]);
    });

    it('leaves no timer behind', () => {
      scheduler.schedule(inMs(ONE_SECOND_MS), 'a', vi.fn());

      scheduler.cancelAll();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
