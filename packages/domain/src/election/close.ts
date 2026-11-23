import type { DomainContext } from '../context';
import type { Election, Position, Round } from '../model';
import { fail, ok, type Result } from '../result';
import { computeResult, type RoundResult } from '../tally/compute-result';
import { findOpenRound, findPosition, replacePosition, replaceRound } from './lookup';

/**
 * Fecha uma rodada aberta antes do prazo, a pedido do admin, e aplica o resultado ao cargo.
 *
 * @param election - Eleição com a rodada aberta.
 * @param roundId - Id da rodada.
 * @returns A eleição com a rodada fechada e o cargo atualizado, ou `ROUND_NOT_FOUND` ou
 *   `ROUND_NOT_OPEN`.
 */
export function closeRound(election: Election, roundId: string): Result<Election> {
  const round = election.rounds.find((candidate) => candidate.id === roundId);
  if (!round) return fail('ROUND_NOT_FOUND', `Round ${roundId} does not exist`);
  if (round.status !== 'OPEN') return fail('ROUND_NOT_OPEN', 'This round is already closed');
  return ok(finalizeRound(election, round));
}

/**
 * Fecha a rodada aberta se o prazo acabou ou se todos os aptos já votaram. O servidor
 * chama antes de cada comando ("fechamento preguiçoso"), então funciona mesmo se o
 * timer se perder num reinício (architecture.md §8.3).
 *
 * @param election - Eleição atual.
 * @param ctx - Contexto do comando; `now` é comparado ao prazo.
 * @returns A eleição com a rodada fechada, ou a **mesma** instância se nada mudou (o
 *   servidor usa isso para decidir se precisa salvar).
 */
export function closeRoundIfDue(election: Election, ctx: DomainContext): Election {
  const round = findOpenRound(election);
  if (!round) return election;

  const isPastDeadline = ctx.now.getTime() > Date.parse(round.deadline);
  return isPastDeadline || everyoneVoted(round) ? finalizeRound(election, round) : election;
}

/**
 * Diz se todos os eleitores aptos da rodada já votaram (§5.4: a rodada fecha sozinha).
 *
 * @param round - Rodada a conferir.
 * @returns `true` se não falta ninguém votar.
 */
export function everyoneVoted(round: Round): boolean {
  return round.eligibleVoterIds.every((voterId) => round.votedVoterIds.includes(voterId));
}

/**
 * Fecha a rodada, apura e aplica o resultado ao cargo.
 *
 * @param election - Eleição atual.
 * @param round - Rodada aberta a fechar.
 * @returns A eleição com a rodada `CLOSED` e o cargo no estado decorrente do resultado.
 * @throws {Error} Se o cargo da rodada não existir (agregado inconsistente).
 */
export function finalizeRound(election: Election, round: Round): Election {
  const position = findPosition(election, round.positionId);
  if (!position)
    throw new Error(`Round ${round.id} points to unknown position ${round.positionId}`);

  const closed: Round = { ...round, status: 'CLOSED' };
  const result = computeResult(closed, position, election.candidates);
  return applyResult(replaceRound(election, closed), position, result);
}

/**
 * Leva o cargo ao próximo estado da máquina da §5.3 conforme o desfecho da apuração.
 *
 * @param election - Eleição com a rodada já fechada.
 * @param position - Cargo apurado.
 * @param result - Resultado da apuração.
 * @returns A eleição com o cargo atualizado.
 */
function applyResult(election: Election, position: Position, result: RoundResult): Election {
  switch (result.outcome) {
    case 'ELECTED':
      return replacePosition(election, {
        ...position,
        status: 'DECIDED',
        electedCandidateId: result.electedCandidateId,
      });
    case 'RUNOFF_REQUIRED':
      return replacePosition(election, { ...position, status: 'AWAITING_RUNOFF' });
    case 'NO_VALID_VOTES': {
      // Num 2º turno sem votos válidos os finalistas continuam os mesmos: o cargo volta a
      // aguardar o 2º turno, em vez de recomeçar do 1º.
      if (result.kind === 'RUNOFF')
        return replacePosition(election, { ...position, status: 'AWAITING_RUNOFF' });
      // §5.4: sem votos válidos o cargo volta ao início da fila e o admin decide o que fazer.
      const pending = replacePosition(election, { ...position, status: 'PENDING' });
      return { ...pending, queue: [position.id, ...election.queue] };
    }
    default: {
      const unreachable: never = result.outcome;
      throw new Error(`Unknown outcome ${String(unreachable)}`);
    }
  }
}
