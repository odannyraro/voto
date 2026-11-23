import { fail, ok, type Result } from '../result';

// Resiliência (README): o admin pode desfazer passos se o sistema se comportar de forma
// inesperada. O servidor guarda um `History<Election>` e empilha um snapshot por comando.

/** Estado atual mais os estados anteriores, do mais antigo para o mais recente. */
export interface History<T> {
  readonly current: T;
  readonly past: readonly T[];
}

/** Quantos estados anteriores são guardados (architecture.md §5.4). */
export const HISTORY_LIMIT = 50;

/**
 * Começa um histórico sem estados anteriores.
 *
 * @param initial - Estado inicial.
 * @returns O histórico com `initial` como estado atual.
 */
export function createHistory<T>(initial: T): History<T> {
  return { current: initial, past: [] };
}

/**
 * Registra um estado novo, guardando o atual como anterior. Acima do limite, os estados
 * mais antigos são esquecidos.
 *
 * @param history - Histórico atual.
 * @param next - Novo estado atual.
 * @param limit - Máximo de estados anteriores; padrão `HISTORY_LIMIT`.
 * @returns O histórico atualizado.
 */
export function pushSnapshot<T>(
  history: History<T>,
  next: T,
  limit: number = HISTORY_LIMIT,
): History<T> {
  return { current: next, past: [...history.past, history.current].slice(-limit) };
}

/**
 * Volta ao estado anterior.
 *
 * @param history - Histórico atual.
 * @returns O histórico com o estado anterior como atual, ou `NOTHING_TO_UNDO`.
 */
export function undo<T>(history: History<T>): Result<History<T>> {
  const previous = history.past.at(-1);
  if (previous === undefined)
    return fail('NOTHING_TO_UNDO', 'There is no previous state to restore');
  return ok({ current: previous, past: history.past.slice(0, -1) });
}

/**
 * Diz se há algum estado anterior para restaurar (o painel usa para mostrar "Desfazer").
 *
 * @param history - Histórico atual.
 * @returns `true` se `undo` vai funcionar.
 */
export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}
