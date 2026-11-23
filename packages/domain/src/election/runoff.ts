import type { DomainContext } from '../context';
import type { Election, Position } from '../model';
import { fail, type Result } from '../result';
import { computeResult } from '../tally/compute-result';
import { findPosition } from './lookup';
import { checkCanStartRound, startRound, type OpenRoundInput } from './rounds';

/**
 * Abre o 2º turno de um cargo cujo 1º turno terminou sem maioria. Os finalistas são
 * recalculados a partir do último 1º turno fechado (a apuração é pura e determinística).
 * O README pede que o 2º turno fique *disponível* ao admin, por isso não é automático.
 *
 * @param election - Eleição aberta, sem outra rodada em andamento.
 * @param input - Cargo e prazo opcional.
 * @param ctx - Contexto do comando.
 * @returns A eleição com a rodada `RUNOFF` aberta, ou `ELECTION_NOT_OPEN`,
 *   `ROUND_IN_PROGRESS`, `POSITION_NOT_FOUND`, `POSITION_NOT_AWAITING_RUNOFF`,
 *   `INVALID_VOTING_DURATION` ou `NO_CREDENTIALED_VOTERS`.
 */
export function openRunoff(
  election: Election,
  input: OpenRoundInput,
  ctx: DomainContext,
): Result<Election> {
  const blocked = checkCanStartRound(election);
  if (blocked) return blocked;

  const position = findPosition(election, input.positionId);
  if (!position) return fail('POSITION_NOT_FOUND', `Position ${input.positionId} does not exist`);
  if (position.status !== 'AWAITING_RUNOFF') {
    return fail('POSITION_NOT_AWAITING_RUNOFF', 'This position does not need a runoff');
  }

  const candidateIds = runoffFinalists(election, position);
  const durationSeconds = input.durationSeconds ?? election.defaultVotingSeconds;
  return startRound(election, { position, kind: 'RUNOFF', candidateIds, durationSeconds }, ctx);
}

/**
 * Recalcula os dois finalistas a partir do último 1º turno fechado do cargo.
 *
 * @param election - Eleição atual.
 * @param position - Cargo em `AWAITING_RUNOFF`.
 * @returns Os ids dos dois finalistas.
 * @throws {Error} Se não houver 1º turno que justifique o 2º (agregado inconsistente).
 */
function runoffFinalists(election: Election, position: Position): readonly string[] {
  const firstRound = election.rounds.findLast(
    (round) =>
      round.positionId === position.id && round.kind === 'FIRST' && round.status === 'CLOSED',
  );
  const finalists =
    firstRound && computeResult(firstRound, position, election.candidates).runoffCandidateIds;
  if (!finalists)
    throw new Error(
      `Position ${position.id} awaits a runoff without a first round that requires it`,
    );
  return finalists;
}
