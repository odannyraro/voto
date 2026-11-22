import { fail, type Result } from '../result';

// Validações reaproveitadas por vários comandos. Cada uma devolve o `Result` de falha
// pronto, ou `undefined` quando está tudo certo, para permitir retorno antecipado.

const MIN_VOTING_SECONDS = 5;
const MAX_VOTING_SECONDS = 3600;

/**
 * Confere se um prazo de rodada é aceitável: inteiro entre 5 s e 1 h, os mesmos
 * limites do schema da API.
 *
 * @param seconds - Prazo informado, em segundos.
 * @returns `INVALID_VOTING_DURATION` se o prazo for inválido; senão `undefined`.
 */
export function validateVotingSeconds(seconds: number): Result<never> | undefined {
  const isValid =
    Number.isInteger(seconds) && seconds >= MIN_VOTING_SECONDS && seconds <= MAX_VOTING_SECONDS;
  if (isValid) return undefined;
  return fail(
    'INVALID_VOTING_DURATION',
    `Voting duration must be a whole number from ${MIN_VOTING_SECONDS} to ${MAX_VOTING_SECONDS} seconds`,
  );
}
