import { describe, expect, it } from 'vitest';
import { KeyedQueue } from '../../src/services/keyed-queue';

/**
 * Cria um portão que o teste abre quando quiser, para manter uma tarefa em andamento.
 *
 * @returns A promessa que as tarefas esperam e a função que a resolve.
 */
function aGate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('KeyedQueue', () => {
  describe('order', () => {
    it('starts a task only after the previous one of the same key has finished', async () => {
      const queue = new KeyedQueue();
      const gate = aGate();
      const events: string[] = [];

      const first = queue.run('e1', async () => {
        events.push('first starts');
        await gate.opened;
        events.push('first ends');
      });
      const second = queue.run('e1', async () => {
        events.push('second starts');
      });
      gate.open();
      await Promise.all([first, second]);

      expect(events).toEqual(['first starts', 'first ends', 'second starts']);
    });

    it('does not make a key wait for the tasks of another key', async () => {
      const queue = new KeyedQueue();
      const gate = aGate();
      const blocked = queue.run('e1', () => gate.opened);

      const other = await queue.run('e2', async () => 'done');

      expect(other).toBe('done');
      gate.open();
      await blocked;
    });
  });

  describe('results', () => {
    it('resolves with what the task returns', async () => {
      const queue = new KeyedQueue();

      const result = await queue.run('e1', async () => 'saved');

      expect(result).toBe('saved');
    });

    it('rejects only the failing task and still runs the next one', async () => {
      const queue = new KeyedQueue();

      const failing = queue.run('e1', () => Promise.reject(new Error('boom')));
      const next = queue.run('e1', async () => 'done');

      await Promise.all([
        expect(failing).rejects.toThrow('boom'),
        expect(next).resolves.toBe('done'),
      ]);
    });
  });

  describe('memory', () => {
    it('keeps a key while it has a pending task', async () => {
      const queue = new KeyedQueue();
      const gate = aGate();

      const pending = queue.run('e1', () => gate.opened);

      expect(queue.size).toBe(1);
      gate.open();
      await pending;
    });

    it('keeps a key until its last task has finished', async () => {
      const queue = new KeyedQueue();
      const gate = aGate();
      const first = queue.run('e1', async () => 'done');
      const last = queue.run('e1', () => gate.opened);

      await first;

      expect(queue.size).toBe(1);
      gate.open();
      await last;
    });

    it('forgets a key once its queue is empty', async () => {
      const queue = new KeyedQueue();

      await Promise.all([
        queue.run('e1', async () => 'first'),
        queue.run('e1', async () => 'second'),
        queue.run('e2', async () => 'third'),
      ]);

      expect(queue.size).toBe(0);
    });

    it('forgets a key whose last task failed', async () => {
      const queue = new KeyedQueue();

      await expect(queue.run('e1', () => Promise.reject(new Error('boom')))).rejects.toThrow();

      expect(queue.size).toBe(0);
    });
  });
});
