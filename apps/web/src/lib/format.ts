import type { TiebreakRule } from '@voto/shared';

const TIEBREAK_LABELS: Record<TiebreakRule, string> = {
  YOUNGEST: 'Youngest candidate',
  OLDEST: 'Oldest candidate',
  MOST_REMAINING_TIME: 'Most remaining time',
};

/**
 * Formata a proporção de votos de um candidato sobre os votos válidos.
 *
 * @param votes - Votos recebidos pelo candidato, como inteiro não negativo.
 * @param validVotes - Total de votos válidos, inteiro não negativo.
 * @returns Percentual arredondado ao inteiro mais próximo e com sufixo `%`.
 * @throws {RangeError} Se as contagens forem inválidas ou excederem os votos válidos.
 */
export function formatVotePercentage(votes: number, validVotes: number): string {
  if (!Number.isSafeInteger(votes) || votes < 0) {
    throw new RangeError('Candidate votes must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(validVotes) || validVotes < 0) {
    throw new RangeError('Valid votes must be a non-negative safe integer.');
  }
  if (votes > validVotes || (validVotes === 0 && votes !== 0)) {
    throw new RangeError('Candidate votes cannot exceed the number of valid votes.');
  }
  if (validVotes === 0) {
    return '0%';
  }

  return `${Math.round((votes / validVotes) * 100)}%`;
}

/**
 * Retorna o rótulo legível da regra de desempate.
 *
 * @param rule - Regra de desempate definida no contrato compartilhado.
 * @returns Nome da regra em inglês para exibição.
 */
export function formatTiebreakRule(rule: TiebreakRule): string {
  return TIEBREAK_LABELS[rule];
}
