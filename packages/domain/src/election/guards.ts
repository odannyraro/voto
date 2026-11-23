import type { Election } from '../model';
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

/**
 * Garante que a eleição ainda está em configuração; usado pelas mudanças estruturais
 * (como criar ou remover cargos) que não podem acontecer com a votação em curso.
 *
 * @param election - Eleição a conferir.
 * @returns `ELECTION_NOT_DRAFT` se a eleição já foi aberta; senão `undefined`.
 */
export function requireDraft(election: Election): Result<never> | undefined {
  if (election.status === 'DRAFT') return undefined;
  return fail('ELECTION_NOT_DRAFT', 'This change is only allowed before the election opens');
}

/**
 * Garante que a eleição não foi encerrada; depois do encerramento nada mais muda.
 *
 * @param election - Eleição a conferir.
 * @returns `ELECTION_FINISHED` se a eleição já terminou; senão `undefined`.
 */
export function requireNotFinished(election: Election): Result<never> | undefined {
  if (election.status !== 'FINISHED') return undefined;
  return fail('ELECTION_FINISHED', 'A finished election cannot be changed');
}

/**
 * Garante que a eleição está aberta para votação.
 *
 * @param election - Eleição a conferir.
 * @returns `ELECTION_NOT_OPEN` se ela estiver em `DRAFT` ou `FINISHED`; senão `undefined`.
 */
export function requireOpen(election: Election): Result<never> | undefined {
  if (election.status === 'OPEN') return undefined;
  return fail('ELECTION_NOT_OPEN', 'The election is not open for voting');
}
