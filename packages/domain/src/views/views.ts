import { findCandidate, findOpenRound, findPosition, replaceRound } from '../election/lookup';
import type { Election, Round, RoundKind } from '../model';
import { fail, ok, type Result } from '../result';
import { computeResult, type RoundResult } from '../tally/compute-result';

/** Cédula como o eleitor a vê: só nomes e prazo, nunca a contagem parcial. */
export interface BallotView {
  readonly roundId: string;
  readonly positionTitle: string;
  readonly kind: RoundKind;
  readonly candidates: readonly { readonly id: string; readonly name: string }[];
  readonly deadline: string;
}

/** Resultado de uma rodada pronto para exibir (formato do `RoundResultDTO`, §6.3). */
export interface RoundResultView extends Omit<RoundResult, 'positionId' | 'counts'> {
  readonly positionTitle: string;
  readonly counts: readonly {
    readonly candidateId: string;
    readonly name: string;
    readonly votes: number;
  }[];
}

/** O que a tela do eleitor deve mostrar agora (formato do `VoterStateDTO`, sem `serverNow`). */
export type VoterView =
  | { readonly phase: 'WAITING'; readonly electionName: string }
  | { readonly phase: 'VOTING'; readonly round: BallotView }
  | { readonly phase: 'VOTED'; readonly roundId: string }
  | { readonly phase: 'RESULTS'; readonly result: RoundResultView }
  | { readonly phase: 'FINISHED' };

/**
 * Libera aos eleitores o resultado de uma rodada fechada. O admin vê o resultado assim
 * que a rodada fecha; os eleitores, só depois disto (§5.4, regra 7). Liberar de novo não
 * muda nada.
 *
 * @param election - Eleição atual.
 * @param roundId - Id da rodada.
 * @returns A eleição com o resultado liberado, ou `ROUND_NOT_FOUND` ou `ROUND_NOT_CLOSED`.
 */
export function releaseResults(election: Election, roundId: string): Result<Election> {
  const round = election.rounds.find((candidate) => candidate.id === roundId);
  if (!round) return fail('ROUND_NOT_FOUND', `Round ${roundId} does not exist`);
  if (round.status !== 'CLOSED')
    return fail('ROUND_NOT_CLOSED', 'Only results of closed rounds can be released');
  return ok(replaceRound(election, { ...round, resultsReleased: true }));
}

/**
 * Resultado da rodada fechada mais recente, para o painel do admin (`lastResult`).
 *
 * @param election - Eleição atual.
 * @returns O resultado com nomes e título do cargo, ou `undefined` se nenhuma rodada fechou.
 */
export function lastResultView(election: Election): RoundResultView | undefined {
  const round = election.rounds.findLast((candidate) => candidate.status === 'CLOSED');
  return round && describeResult(election, round);
}

/**
 * Decide a tela do eleitor. Nunca expõe códigos de outros eleitores nem contagens antes
 * da liberação.
 *
 * @param election - Eleição atual.
 * @param voterId - Id do eleitor que está olhando.
 * @returns A fase da tela com os dados que o eleitor pode ver.
 */
export function voterView(election: Election, voterId: string): VoterView {
  if (election.status === 'FINISHED') return { phase: 'FINISHED' };

  const open = findOpenRound(election);
  if (open) return openRoundView(election, open, voterId);

  // Só a rodada mais recente importa: se ela foi anulada ou não liberada, o eleitor espera.
  const latest = election.rounds.at(-1);
  if (latest?.status === 'CLOSED' && latest.resultsReleased) {
    return { phase: 'RESULTS', result: describeResult(election, latest) };
  }
  return { phase: 'WAITING', electionName: election.name };
}

/**
 * Tela do eleitor durante uma rodada aberta.
 *
 * @param election - Eleição atual.
 * @param round - Rodada aberta.
 * @param voterId - Id do eleitor.
 * @returns `VOTING` com a cédula, `VOTED` se já votou ou `WAITING` se não é apto nesta rodada.
 */
function openRoundView(election: Election, round: Round, voterId: string): VoterView {
  if (!round.eligibleVoterIds.includes(voterId))
    return { phase: 'WAITING', electionName: election.name };
  if (round.votedVoterIds.includes(voterId)) return { phase: 'VOTED', roundId: round.id };

  return {
    phase: 'VOTING',
    round: {
      roundId: round.id,
      positionTitle: positionTitleOf(election, round),
      kind: round.kind,
      candidates: round.candidateIds.map((id) => ({ id, name: candidateNameOf(election, id) })),
      deadline: round.deadline,
    },
  };
}

/**
 * Apura uma rodada fechada e troca ids por nomes.
 *
 * @param election - Eleição atual.
 * @param round - Rodada fechada.
 * @returns O resultado pronto para exibir.
 * @throws {Error} Se o cargo da rodada não existir (agregado inconsistente).
 */
function describeResult(election: Election, round: Round): RoundResultView {
  const position = findPosition(election, round.positionId);
  if (!position)
    throw new Error(`Round ${round.id} points to unknown position ${round.positionId}`);

  const {
    positionId: _positionId,
    counts,
    ...rest
  } = computeResult(round, position, election.candidates);
  return {
    ...rest,
    positionTitle: position.title,
    counts: counts.map((count) => ({
      ...count,
      name: candidateNameOf(election, count.candidateId),
    })),
  };
}

/**
 * Título do cargo de uma rodada.
 *
 * @param election - Eleição atual.
 * @param round - Rodada.
 * @returns O título, ou o id do cargo se ele não existir mais.
 */
function positionTitleOf(election: Election, round: Round): string {
  return findPosition(election, round.positionId)?.title ?? round.positionId;
}

/**
 * Nome de um candidato para exibição.
 *
 * @param election - Eleição atual.
 * @param candidateId - Id do candidato.
 * @returns O nome, ou o id se o candidato não existir mais.
 */
function candidateNameOf(election: Election, candidateId: string): string {
  return findCandidate(election, candidateId)?.name ?? candidateId;
}
