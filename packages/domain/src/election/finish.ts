import type { Election } from '../model';
import { ok, type Result } from '../result';
import { checkCanStartRound } from './rounds';

/**
 * Encerra a eleição. Depois disso nenhum comando altera mais nada e os eleitores veem a
 * tela de encerramento. Cargos ainda pendentes ficam como estão: a decisão de encerrar
 * mesmo assim é do admin.
 *
 * @param election - Eleição aberta.
 * @returns A eleição em `FINISHED`, ou `ELECTION_NOT_OPEN` ou `ROUND_IN_PROGRESS` (feche ou
 *   anule a rodada antes, para não perder votos sem querer).
 */
export function finishElection(election: Election): Result<Election> {
  // As mesmas pré-condições de abrir uma rodada: eleição aberta e nenhuma rodada em curso.
  const blocked = checkCanStartRound(election);
  if (blocked) return blocked;
  return ok({ ...election, status: 'FINISHED' });
}
