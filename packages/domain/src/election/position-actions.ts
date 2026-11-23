import type { Election } from '../model';
import { fail, ok, type Result } from '../result';
import { requireNotFinished } from './guards';
import { findPosition, replacePosition } from './lookup';

/**
 * Adia um cargo: ele vai para o fim da fila. É uma das saídas do README quando o cargo
 * da vez não tem candidatos e o admin ainda não quer resolver.
 *
 * @param election - Eleição atual.
 * @param positionId - Id de um cargo `PENDING`.
 * @returns A eleição com a fila reordenada, ou `ELECTION_FINISHED`, `POSITION_NOT_FOUND` ou
 *   `POSITION_NOT_PENDING`.
 */
export function deferPosition(election: Election, positionId: string): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const position = findPosition(election, positionId);
  if (!position) return fail('POSITION_NOT_FOUND', `Position ${positionId} does not exist`);
  if (position.status !== 'PENDING') return fail('POSITION_NOT_PENDING', 'Only positions in the queue can be deferred');

  return ok({ ...election, queue: [...election.queue.filter((id) => id !== positionId), positionId] });
}

/**
 * Cancela a eleição de um cargo, o último recurso do README. A UI mostra dois diálogos e
 * o domínio reforça exigindo que o título do cargo seja digitado exatamente igual.
 *
 * @param election - Eleição atual.
 * @param positionId - Id de um cargo `PENDING` ou `AWAITING_RUNOFF`.
 * @param confirmTitle - Título digitado pelo admin na segunda confirmação.
 * @returns A eleição com o cargo `CANCELLED` e fora da fila, ou `ELECTION_FINISHED`,
 *   `POSITION_NOT_FOUND`, `POSITION_NOT_PENDING` ou `CONFIRMATION_MISMATCH`.
 */
export function cancelPosition(election: Election, positionId: string, confirmTitle: string): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const position = findPosition(election, positionId);
  if (!position) return fail('POSITION_NOT_FOUND', `Position ${positionId} does not exist`);
  if (position.status !== 'PENDING' && position.status !== 'AWAITING_RUNOFF') {
    return fail('POSITION_NOT_PENDING', 'Only positions that are not being voted or decided can be cancelled');
  }
  if (confirmTitle !== position.title) {
    return fail('CONFIRMATION_MISMATCH', 'Type the exact position title to confirm the cancellation');
  }

  const cancelled = replacePosition(election, { ...position, status: 'CANCELLED' });
  return ok({ ...cancelled, queue: election.queue.filter((id) => id !== positionId) });
}
