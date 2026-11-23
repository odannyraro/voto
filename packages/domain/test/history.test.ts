import { describe, expect, it } from 'vitest';
import { canUndo, createHistory, HISTORY_LIMIT, pushSnapshot, undo } from '../src/index';

describe('history', () => {
  it('starts with nothing to undo', () => {
    const history = createHistory('draft');

    expect(canUndo(history)).toBe(false);
  });

  it('keeps the previous state when a new one is pushed', () => {
    const history = pushSnapshot(createHistory('draft'), 'open');

    expect(history).toEqual({ current: 'open', past: ['draft'] });
  });

  it('restores the previous state on undo', () => {
    const history = pushSnapshot(pushSnapshot(createHistory('draft'), 'open'), 'voting');

    const result = undo(history);

    expect(result).toEqual({ ok: true, value: { current: 'open', past: ['draft'] } });
  });

  it('rejects undo when there is no previous state', () => {
    const result = undo(createHistory('draft'));

    expect(result).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_UNDO' } });
  });

  it('forgets the oldest states beyond the limit', () => {
    const limit = 2;
    const history = pushSnapshot(pushSnapshot(pushSnapshot(createHistory('s0'), 's1', limit), 's2', limit), 's3', limit);

    expect(history).toEqual({ current: 's3', past: ['s1', 's2'] });
  });

  it('keeps up to fifty previous states by default', () => {
    expect(HISTORY_LIMIT).toBe(50);
  });
});
