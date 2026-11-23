/** Trabalho agendado; pode ser assíncrono. */
export type ScheduledTask = () => void | Promise<void>;

/** Porta de agendamento: o servidor usa para fechar rodadas no prazo. */
export interface Scheduler {
  /**
   * Agenda uma tarefa. Se já houver uma tarefa com a mesma chave, ela é substituída.
   *
   * @param at - Instante em que a tarefa deve rodar.
   * @param key - Identifica a tarefa (ex.: `round:<electionId>`).
   * @param task - O que executar.
   */
  schedule(at: Date, key: string, task: ScheduledTask): void;

  /**
   * Cancela a tarefa de uma chave; sem efeito se não houver.
   *
   * @param key - Chave usada em `schedule`.
   */
  cancel(key: string): void;
}
