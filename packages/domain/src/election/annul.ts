import type { Election, Round } from '../model';
import { fail, ok, type Result } from '../result';
import { requireNotFinished } from './guards';
import { findPosition, replacePosition, replaceRound } from './lookup';

/**
 * Anula uma rodada (aberta ou fechada) e devolve o cargo a `PENDING`, no início da fila.
 * Se a rodada tinha eleito alguém, a eleição é desfeita e o candidato volta a ser apto
 * nos outros cargos. Ação de resiliência do README.
 *
 * @param election - Eleição atual.
 * @param roundId - Id da rodada; precisa ser a última rodada válida do seu cargo.
 * @returns A eleição com a rodada `ANNULLED`, ou `ELECTION_FINISHED`, `ROUND_NOT_FOUND` ou
 *   `ROUND_NOT_LATEST`.
 * @throws {Error} Se o cargo da rodada não existir (agregado inconsistente).
 */
export function annulRound(election: Election, roundId: string): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const round = election.rounds.find((candidate) => candidate.id === roundId);
  if (!round) return fail('ROUND_NOT_FOUND', `Round ${roundId} does not exist`);
  // Anular uma rodada antiga deixaria o cargo num estado que não corresponde à última votação.
  if (latestValidRound(election, round.positionId)?.id !== roundId) {
    return fail('ROUND_NOT_LATEST', 'Only the latest valid round of a position can be annulled');
  }

  const position = findPosition(election, round.positionId);
  if (!position) throw new Error(`Round ${round.id} points to unknown position ${round.positionId}`);

  const { electedCandidateId: _discarded, ...withoutWinner } = position;
  const annulled = replaceRound(election, { ...round, status: 'ANNULLED' });
  const pending = replacePosition(annulled, { ...withoutWinner, status: 'PENDING' });
  return ok({ ...pending, queue: [position.id, ...election.queue.filter((id) => id !== position.id)] });
}

/**
 * Última rodada não anulada de um cargo.
 *
 * @param election - Eleição atual.
 * @param positionId - Id do cargo.
 * @returns A rodada, ou `undefined` se não houver.
 */
function latestValidRound(election: Election, positionId: string): Round | undefined {
  return election.rounds.findLast((round) => round.positionId === positionId && round.status !== 'ANNULLED');
}
