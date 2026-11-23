import { describe, expect, it } from 'vitest';
import { FakeScheduler } from './fake-scheduler';

const NOON = new Date('2026-01-01T12:00:00.000Z');
const ONE_MS_AFTER_NOON = new Date('2026-01-01T12:00:00.001Z');
const LATER = new Date('2026-01-01T13:00:00.000Z');

/** Tarefa que anota seu nome numa lista, para o teste ver o que rodou. */
function recordInto(ran: string[], name: string): () => void {
  return () => {
    ran.push(name);
  };
}

describe('FakeScheduler', () => {
  it('runs a task whose time has arrived exactly', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(NOON, 'a', recordInto(ran, 'a'));

    await scheduler.fireDue(NOON);

    expect(ran).toEqual(['a']);
  });

  it('keeps a task that is still 1 ms in the future', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(ONE_MS_AFTER_NOON, 'a', recordInto(ran, 'a'));

    await scheduler.fireDue(NOON);

    expect(ran).toEqual([]);
  });

  it('runs only the due tasks when others are still in the future', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(NOON, 'due', recordInto(ran, 'due'));
    scheduler.schedule(LATER, 'future', recordInto(ran, 'future'));

    await scheduler.fireDue(NOON);

    expect(scheduler.pending()).toEqual([{ key: 'future', at: LATER }]);
  });

  it('does not run a cancelled task', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(NOON, 'a', recordInto(ran, 'a'));

    scheduler.cancel('a');
    await scheduler.fireDue(LATER);

    expect(ran).toEqual([]);
  });

  it('ignores the cancellation of a key that was never scheduled', () => {
    const scheduler = new FakeScheduler();

    expect(() => scheduler.cancel('unknown')).not.toThrow();
  });

  it('replaces the previous task when the same key is scheduled again', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(NOON, 'round', recordInto(ran, 'old'));

    scheduler.schedule(LATER, 'round', recordInto(ran, 'new'));
    await scheduler.fireDue(LATER);

    expect(ran).toEqual(['new']);
  });

  it('lists the replacement time of a rescheduled key', () => {
    const scheduler = new FakeScheduler();
    scheduler.schedule(NOON, 'round', () => {});

    scheduler.schedule(LATER, 'round', () => {});

    expect(scheduler.pending()).toEqual([{ key: 'round', at: LATER }]);
  });

  it('removes a task from the pending list once it has run', async () => {
    const scheduler = new FakeScheduler();
    scheduler.schedule(NOON, 'a', () => {});

    await scheduler.fireDue(NOON);

    expect(scheduler.pending()).toEqual([]);
  });

  it('runs the task of a key on fire even if its time has not arrived', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(LATER, 'a', recordInto(ran, 'a'));

    await scheduler.fire('a');

    expect(ran).toEqual(['a']);
  });

  it('rejects firing a key that has no scheduled task', async () => {
    const scheduler = new FakeScheduler();

    await expect(scheduler.fire('unknown')).rejects.toThrow('unknown');
  });

  it('waits for an asynchronous task to finish before fireDue resolves', async () => {
    const scheduler = new FakeScheduler();
    const ran: string[] = [];
    scheduler.schedule(NOON, 'slow', async () => {
      await Promise.resolve();
      ran.push('slow');
    });

    await scheduler.fireDue(NOON);

    expect(ran).toEqual(['slow']);
  });
});
