import type { Candidate, TiebreakRule } from '../model';
import { rankByTiebreak } from '../tiebreak/tiebreak';
import type { CandidateCount } from './compute-result';

/** Os dois finalistas do 2º turno e se foi preciso desempatar para escolhê-los. */
export interface RunoffCut {
  readonly finalists: readonly [string, string];
  readonly tiebreakApplied: boolean;
}

const FINALISTS = 2;

/**
 * Escolhe os dois finalistas do 2º turno. Se houver empate na fronteira (três ou mais
 * empatados em 1º, ou dois ou mais empatados em 2º), aplica a regra de desempate só
 * entre os empatados, até sobrarem exatamente dois (architecture.md §5.4, regra 4).
 *
 * @param counts - Contagem do 1º turno, do mais para o menos votado; ao menos 2 candidatos.
 * @param tiebreak - Regra de desempate do cargo.
 * @param candidates - Candidatos da cédula, já resolvidos a partir dos ids.
 * @returns Os finalistas, na ordem de classificação, e se houve desempate.
 * @throws {Error} Se houver menos de dois candidatos na contagem (bug de quem chamou).
 */
export function cutForRunoff(
  counts: readonly CandidateCount[],
  tiebreak: TiebreakRule,
  candidates: readonly Candidate[],
): RunoffCut {
  const finalists: string[] = [];
  let tiebreakApplied = false;

  // Percorre os grupos de mesma votação, do maior para o menor, até completar 2 vagas.
  for (const votes of distinctVotes(counts)) {
    const open = FINALISTS - finalists.length;
    if (open === 0) break;

    const group = counts.filter((count) => count.votes === votes).map((count) => count.candidateId);
    if (group.length > open) {
      tiebreakApplied = true;
      const ranked = rankByTiebreak(candidates.filter((c) => group.includes(c.id)), tiebreak);
      finalists.push(...ranked.slice(0, open).map((candidate) => candidate.id));
    } else {
      finalists.push(...group);
    }
  }

  const [first, second] = finalists;
  if (first === undefined || second === undefined) throw new Error('A runoff needs at least two candidates');
  return { finalists: [first, second], tiebreakApplied };
}

/**
 * Lista as votações distintas, da maior para a menor.
 *
 * @param counts - Contagem ordenada do mais para o menos votado.
 * @returns Valores de votos sem repetição.
 */
function distinctVotes(counts: readonly CandidateCount[]): number[] {
  return [...new Set(counts.map((count) => count.votes))];
}
