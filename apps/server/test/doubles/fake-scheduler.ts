import type { ScheduledTask, Scheduler } from '../../src/ports';

/** Tarefa agendada ainda não executada. */
export interface PendingTask {
  readonly key: string;
  readonly at: Date;
}

interface Entry {
  readonly at: Date;
  readonly task: ScheduledTask;
}

/** Agendador de teste: nada roda sozinho; o teste dispara as tarefas. */
export class FakeScheduler implements Scheduler {
  private readonly entries = new Map<string, Entry>();

  /**
   * Agenda uma tarefa; a mesma chave substitui a anterior.
   *
   * @param at - Instante em que a tarefa vence.
   * @param key - Identifica a tarefa.
   * @param task - O que executar.
   */
  schedule(at: Date, key: string, task: ScheduledTask): void {
    this.entries.set(key, { at, task });
  }

  /**
   * Cancela a tarefa de uma chave; sem efeito se não houver.
   *
   * @param key - Chave da tarefa.
   */
  cancel(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Lista as tarefas agendadas.
   *
   * @returns Chave e instante de cada tarefa ainda não executada nem cancelada.
   */
  pending(): PendingTask[] {
    return [...this.entries].map(([key, { at }]) => ({ key, at }));
  }

  /**
   * Executa as tarefas vencidas (instante menor ou igual a `now`), uma de cada vez.
   *
   * @param now - Instante de referência.
   */
  async fireDue(now: Date): Promise<void> {
    const dueKeys = [...this.entries]
      .filter(([, { at }]) => at.getTime() <= now.getTime())
      .map(([key]) => key);
    for (const key of dueKeys) {
      // Uma tarefa anterior pode ter cancelado esta; nesse caso ela não roda.
      if (this.entries.has(key)) await this.fire(key);
    }
  }

  /**
   * Executa a tarefa de uma chave, vencida ou não, e a remove da lista.
   *
   * @param key - Chave da tarefa.
   * @throws {Error} Se não houver tarefa agendada para a chave.
   */
  async fire(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry === undefined) throw new Error(`No task scheduled for key "${key}"`);
    // Remove antes de rodar: a tarefa pode reagendar a própria chave.
    this.entries.delete(key);
    await entry.task();
  }
}
