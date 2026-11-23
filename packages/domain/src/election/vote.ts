import type { DomainContext } from '../context';
import { BLANK, type Election, type Round, type VoteChoice } from '../model';
import { fail, ok, type Result } from '../result';
import { everyoneVoted, finalizeRound } from './close';
import { replaceRound } from './lookup';

/** Voto de um eleitor (mesmo formato do corpo de `POST /voter/votes`, mais o eleitor). */
export interface CastVoteInput {
  readonly roundId: string;
  readonly voterId: string;
  /** Id de um candidato da cédula ou `BLANK`. */
  readonly choice: VoteChoice;
}

/**
 * Registra o voto de um eleitor numa rodada aberta. Guarda *quem votou* separado de
 * *em quem*, para preservar o sigilo (architecture.md §5.1). Se for o último eleitor apto,
 * a rodada já é fechada e apurada.
 *
 * @param election - Eleição com a rodada aberta.
 * @param input - Rodada, eleitor e escolha.
 * @param ctx - Contexto do comando; `now` é comparado ao prazo da rodada (o servidor já
 *   desconta a tolerância de rede antes de chamar).
 * @returns A eleição com o voto contado, ou `ROUND_NOT_FOUND`, `ROUND_NOT_OPEN`,
 *   `ROUND_EXPIRED`, `VOTER_NOT_ELIGIBLE`, `VOTER_REVOKED`, `VOTER_ALREADY_VOTED` ou
 *   `INVALID_CHOICE`.
 */
export function castVote(
  election: Election,
  input: CastVoteInput,
  ctx: DomainContext,
): Result<Election> {
  const round = election.rounds.find((candidate) => candidate.id === input.roundId);
  if (!round) return fail('ROUND_NOT_FOUND', `Round ${input.roundId} does not exist`);

  const rejected = checkVote(election, round, input, ctx.now);
  if (rejected) return rejected;

  const updatedRound: Round = {
    ...round,
    votedVoterIds: [...round.votedVoterIds, input.voterId],
    tally: { ...round.tally, [input.choice]: (round.tally[input.choice] ?? 0) + 1 },
  };
  const withVote = replaceRound(election, updatedRound);
  // §5.4: quando o último apto vota, a rodada fecha sem esperar o prazo.
  return ok(everyoneVoted(updatedRound) ? finalizeRound(withVote, updatedRound) : withVote);
}

/**
 * Aplica as regras de votação da §5.4 a um voto.
 *
 * @param election - Eleição, para consultar o status do eleitor.
 * @param round - Rodada em que se quer votar.
 * @param input - O voto.
 * @param now - Instante considerado para o prazo.
 * @returns O `Result` de falha da primeira regra violada, ou `undefined` se o voto vale.
 */
function checkVote(
  election: Election,
  round: Round,
  input: CastVoteInput,
  now: Date,
): Result<never> | undefined {
  if (round.status !== 'OPEN') return fail('ROUND_NOT_OPEN', 'This round is not accepting votes');
  // §5.4: o prazo vale mesmo que a rodada ainda não tenha sido fechada formalmente.
  if (now.getTime() > Date.parse(round.deadline))
    return fail('ROUND_EXPIRED', 'The voting deadline has passed');

  if (!round.eligibleVoterIds.includes(input.voterId)) {
    return fail('VOTER_NOT_ELIGIBLE', 'Only voters credentialed when the round opened can vote');
  }
  const voter = election.voters.find((v) => v.id === input.voterId);
  if (voter?.status !== 'CREDENTIALED') return fail('VOTER_REVOKED', 'This voter code was revoked');
  if (round.votedVoterIds.includes(input.voterId))
    return fail('VOTER_ALREADY_VOTED', 'This voter already voted');

  if (input.choice !== BLANK && !round.candidateIds.includes(input.choice)) {
    return fail('INVALID_CHOICE', 'The choice must be a candidate on the ballot or a blank vote');
  }
  return undefined;
}
