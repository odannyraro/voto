import type { Candidate, TiebreakRule } from '../model';

/** Comparador de candidatos: negativo quando `a` deve vencer `b`. */
type CandidateComparator = (a: Candidate, b: Candidate) => number;

// Strategy: um comparador por regra de desempate (architecture.md §5.4).
const RULE_COMPARATORS: Readonly<Record<TiebreakRule, CandidateComparator>> = {
  YOUNGEST: (a, b) => a.age - b.age,
  OLDEST: (a, b) => b.age - a.age,
  // §5.5: mais tempo restante vence, porque a pessoa consegue cumprir o mandato.
  MOST_REMAINING_TIME: (a, b) => b.remainingMonths - a.remainingMonths,
};

/**
 * Ordena candidatos do vencedor para o perdedor segundo a regra de desempate do cargo.
 * Se a regra empatar, vence quem se cadastrou antes; por último, o id, para que o
 * resultado nunca dependa da ordem de entrada.
 *
 * @param candidates - Candidatos empatados (a lista recebida não é alterada).
 * @param rule - Regra de desempate do cargo.
 * @returns Uma nova lista, com o vencedor do desempate na primeira posição.
 */
export function rankByTiebreak(candidates: readonly Candidate[], rule: TiebreakRule): Candidate[] {
  const byRule = RULE_COMPARATORS[rule];
  return [...candidates].sort(
    (a, b) => byRule(a, b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
