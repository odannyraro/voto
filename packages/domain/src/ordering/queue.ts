import { attachableCandidates, eligibleCandidates } from '../eligibility/eligibility';
import { requireNotFinished } from '../election/guards';
import { findOpenRound } from '../election/lookup';
import type { Election } from '../model';
import { fail, ok, type Result } from '../result';

/** O que o admin deve fazer em seguida (formato do `NextPositionDTO`, §6.3). */
export interface NextPositionInfo {
  readonly status:
    'READY' | 'INSUFFICIENT_CANDIDATES' | 'NONE_LEFT' | 'ROUND_IN_PROGRESS' | 'AWAITING_RUNOFF';
  /** Cargo a que o status se refere; ausente em `NONE_LEFT`. */
  readonly positionId?: string;
  /** Só em `INSUFFICIENT_CANDIDATES`: candidatos existentes que podem ser anexados ao cargo. */
  readonly attachableCandidates?: readonly { readonly id: string; readonly name: string }[];
}

/**
 * Diz qual é o próximo passo da votação: há rodada em andamento, há 2º turno pendente,
 * o cargo do topo da fila está pronto, o cargo do topo não tem candidatos aptos (README:
 * "candidatos insuficientes") ou não sobrou nada.
 *
 * @param election - Eleição atual.
 * @returns A situação do próximo passo e o cargo envolvido.
 */
export function nextPositionStatus(election: Election): NextPositionInfo {
  const open = findOpenRound(election);
  if (open) return { status: 'ROUND_IN_PROGRESS', positionId: open.positionId };

  const awaitingRunoff = election.positions.find(
    (position) => position.status === 'AWAITING_RUNOFF',
  );
  if (awaitingRunoff) return { status: 'AWAITING_RUNOFF', positionId: awaitingRunoff.id };

  const [positionId] = election.queue;
  if (positionId === undefined) return { status: 'NONE_LEFT' };

  if (eligibleCandidates(election, positionId).length > 0) return { status: 'READY', positionId };
  return {
    status: 'INSUFFICIENT_CANDIDATES',
    positionId,
    attachableCandidates: attachableCandidates(election, positionId).map(({ id, name }) => ({
      id,
      name,
    })),
  };
}

/**
 * Troca a ordem da fila pela escolhida pelo admin (manual ou vinda de `suggestOrder`,
 * que nunca é aplicada sem confirmação).
 *
 * @param election - Eleição atual.
 * @param positionIds - Os mesmos cargos da fila atual, na nova ordem.
 * @returns A eleição com a fila nova, ou `ELECTION_FINISHED` ou `INVALID_QUEUE_ORDER`
 *   (faltou, sobrou ou repetiu cargo).
 */
export function applyOrder(election: Election, positionIds: readonly string[]): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const isSamePositions =
    positionIds.length === election.queue.length &&
    new Set(positionIds).size === positionIds.length &&
    positionIds.every((id) => election.queue.includes(id));
  if (!isSamePositions) {
    return fail(
      'INVALID_QUEUE_ORDER',
      'The new order must contain exactly the positions in the queue',
    );
  }
  return ok({ ...election, queue: [...positionIds] });
}
