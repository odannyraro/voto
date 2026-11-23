import { BLANK, type Candidate, type Position, type Round, type RoundKind } from '../model';
import { rankByTiebreak } from '../tiebreak/tiebreak';
import { cutForRunoff } from './runoff-cut';

/** Desfecho da apuração de uma rodada. */
export type RoundOutcome = 'ELECTED' | 'RUNOFF_REQUIRED' | 'NO_VALID_VOTES';

/** Votos de um candidato na rodada. */
export interface CandidateCount {
  readonly candidateId: string;
  readonly votes: number;
}

/** Resultado da apuração de uma rodada fechada. */
export interface RoundResult {
  readonly roundId: string;
  readonly positionId: string;
  readonly kind: RoundKind;
  /** Do mais para o menos votado; empates seguem a ordem da cédula. */
  readonly counts: readonly CandidateCount[];
  readonly blank: number;
  /** Votos em candidatos; brancos não entram. */
  readonly validVotes: number;
  readonly outcome: RoundOutcome;
  /** Presente quando `outcome` é `ELECTED`. */
  readonly electedCandidateId?: string;
  /** Presente quando `outcome` é `RUNOFF_REQUIRED`. */
  readonly runoffCandidateIds?: readonly [string, string];
  /** Se a regra de desempate do cargo precisou ser usada. */
  readonly tiebreakApplied: boolean;
}

/** Contagem da rodada, antes de decidir o desfecho. */
interface VoteCount {
  readonly counts: readonly CandidateCount[];
  readonly blank: number;
  readonly validVotes: number;
}

/** Parte do resultado que depende do desfecho. */
type Decision = Pick<RoundResult, 'outcome' | 'electedCandidateId' | 'runoffCandidateIds' | 'tiebreakApplied'>;

// Com até este número de candidatos na cédula não há 2º turno (architecture.md §5.4).
const MAX_CANDIDATES_WITHOUT_RUNOFF = 2;

/**
 * Apura uma rodada fechada: conta os votos válidos (brancos não entram) e decide se há
 * eleito, se é preciso 2º turno ou se não houve votos válidos.
 *
 * @param round - Rodada já fechada, com a contagem congelada.
 * @param position - Cargo da rodada; fornece a regra de desempate.
 * @param candidates - Candidatos da eleição; usados no desempate por idade ou tempo restante.
 * @returns O resultado: `ELECTED` com o eleito, `RUNOFF_REQUIRED` com os dois finalistas ou
 *   `NO_VALID_VOTES`.
 * @throws {Error} Se a rodada ainda estiver aberta ou se a cédula citar um candidato
 *   inexistente (ambos indicam bug de quem chamou).
 */
export function computeResult(round: Round, position: Position, candidates: readonly Candidate[]): RoundResult {
  if (round.status === 'OPEN') throw new Error(`Round ${round.id} is still open and cannot be counted`);

  const count = countVotes(round);
  return {
    roundId: round.id,
    positionId: position.id,
    kind: round.kind,
    ...count,
    ...decide(round, count, position, candidates),
  };
}

/**
 * Conta os votos de cada candidato da cédula e os brancos.
 *
 * @param round - Rodada a contar.
 * @returns Contagem por candidato (ordenada), brancos e total de válidos.
 */
function countVotes(round: Round): VoteCount {
  const counts = round.candidateIds
    .map((candidateId) => ({ candidateId, votes: round.tally[candidateId] ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
  const validVotes = counts.reduce((total, count) => total + count.votes, 0);
  return { counts, blank: round.tally[BLANK] ?? 0, validVotes };
}

/**
 * Aplica as regras de apuração da §5.4 sobre a contagem.
 *
 * @param round - Rodada apurada (tipo e tamanho da cédula importam).
 * @param count - Contagem já feita.
 * @param position - Cargo, com a regra de desempate.
 * @param candidates - Candidatos da eleição.
 * @returns O desfecho e, conforme o caso, o eleito ou os finalistas.
 */
function decide(round: Round, count: VoteCount, position: Position, candidates: readonly Candidate[]): Decision {
  const [leader] = count.counts;
  if (!leader || count.validVotes === 0) return { outcome: 'NO_VALID_VOTES', tiebreakApplied: false };

  const isMostVotedWins = round.kind === 'RUNOFF' || round.candidateIds.length <= MAX_CANDIDATES_WITHOUT_RUNOFF;
  if (isMostVotedWins) return electMostVoted(count.counts, position, candidates);

  // README: maioria é mais de 50% dos votos válidos.
  if (leader.votes * 2 > count.validVotes) {
    return { outcome: 'ELECTED', electedCandidateId: leader.candidateId, tiebreakApplied: false };
  }
  const ballot = resolveCandidates(round.candidateIds, candidates);
  const cut = cutForRunoff(count.counts, position.tiebreak, ballot);
  return { outcome: 'RUNOFF_REQUIRED', runoffCandidateIds: cut.finalists, tiebreakApplied: cut.tiebreakApplied };
}

/**
 * Elege o mais votado; se houver empate no topo, usa a regra de desempate do cargo.
 *
 * @param counts - Contagem ordenada do mais para o menos votado.
 * @param position - Cargo, com a regra de desempate.
 * @param candidates - Candidatos da eleição.
 * @returns Desfecho `ELECTED`.
 */
function electMostVoted(counts: readonly CandidateCount[], position: Position, candidates: readonly Candidate[]): Decision {
  const topVotes = counts[0]?.votes ?? 0;
  const tied = counts.filter((count) => count.votes === topVotes).map((count) => count.candidateId);
  const [winner] = rankByTiebreak(resolveCandidates(tied, candidates), position.tiebreak);
  return { outcome: 'ELECTED', electedCandidateId: winner?.id, tiebreakApplied: tied.length > 1 };
}

/**
 * Troca ids por candidatos, para aplicar o desempate.
 *
 * @param ids - Ids da cédula.
 * @param candidates - Candidatos da eleição.
 * @returns Os candidatos correspondentes, na mesma ordem.
 * @throws {Error} Se algum id não existir entre os candidatos.
 */
function resolveCandidates(ids: readonly string[], candidates: readonly Candidate[]): Candidate[] {
  return ids.map((id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) throw new Error(`Ballot references unknown candidate ${id}`);
    return candidate;
  });
}
