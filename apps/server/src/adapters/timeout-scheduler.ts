import type { ScheduledTask, Scheduler } from '../ports';

// Maior atraso que o `setTimeout` aceita (inteiro de 32 bits com sinal); acima disso o Node
// dispara na hora. Um prazo mais distante é cumprido em etapas.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Agendador real, baseado em `setTimeout`. Guarda uma tarefa por chave e cumpre prazos mais
 * longos que o limite do timer em etapas, rearmando até o instante pedido.
 */
export class TimeoutScheduler implements Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /**
   * Agenda uma tarefa; a mesma chave substitui a anterior. Instante no passado dispara logo.
   * A tarefa não pode lançar: um erro dentro do timer derrubaria o processo, então quem agenda
   * trata as próprias falhas (ex.: `ElectionService.handleDeadline` registra em log).
   *
   * @param at - Instante em que a tarefa deve rodar.
   * @param key - Identifica a tarefa (ex.: `round:<electionId>`).
   * @param task - O que executar.
   */
  schedule(at: Date, key: string, task: ScheduledTask): void {
    this.cancel(key);
    this.arm(at, key, task);
  }

  /**
   * Cancela a tarefa de uma chave; sem efeito se não houver.
   *
   * @param key - Chave usada em `schedule`.
   */
  cancel(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }

  /** Cancela todas as tarefas pendentes; usado no desligamento para não segurar o processo. */
  cancelAll(): void {
    for (const key of [...this.timers.keys()]) this.cancel(key);
  }

  /**
   * Arma um timer para o instante pedido, ou para o limite do timer se ele ainda estiver mais
   * longe; nesse caso, ao disparar, calcula o que falta e arma de novo.
   *
   * @param at - Instante em que a tarefa deve rodar.
   * @param key - Chave da tarefa.
   * @param task - O que executar.
   */
  private arm(at: Date, key: string, task: ScheduledTask): void {
    // O adaptador é a fronteira com o tempo real; as regras de negócio usam o `Clock`.
    const remainingMs = Math.max(0, at.getTime() - Date.now());
    const timer = setTimeout(
      () => {
        this.timers.delete(key);
        if (remainingMs > MAX_TIMER_DELAY_MS) this.arm(at, key, task);
        else void task();
      },
      Math.min(remainingMs, MAX_TIMER_DELAY_MS),
    );
    this.timers.set(key, timer);
  }
}
