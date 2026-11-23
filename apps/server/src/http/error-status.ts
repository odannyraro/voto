import type { ErrorCode } from '@voto/shared';

const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;
const TOO_MANY_REQUESTS = 429;
const INTERNAL_SERVER_ERROR = 500;

/** Códigos com status próprio que não seguem a regra `*_NOT_FOUND` nem o padrão 409. */
const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: BAD_REQUEST,
  INVALID_CREDENTIALS: UNAUTHORIZED,
  INVALID_TOKEN: UNAUTHORIZED,
  FORBIDDEN,
  // architecture.md §6.2: eleitor revogado que tenta entrar recebe 403, não 409.
  VOTER_REVOKED: FORBIDDEN,
  // Código de eleitor inexistente: o recurso "código" não foi encontrado (§6.2).
  INVALID_CODE: NOT_FOUND,
  ROUND_EXPIRED: GONE,
  RATE_LIMITED: TOO_MANY_REQUESTS,
  INTERNAL_ERROR: INTERNAL_SERVER_ERROR,
};

/**
 * Traduz um código de erro da API no status HTTP correspondente (architecture.md §6.3).
 * Usada pelo tratador global de erros para que domínio e servidor falem o mesmo idioma HTTP.
 *
 * @param code - Código de erro, do domínio ou do servidor.
 * @returns O status HTTP: 400 validação, 401 credenciais/token, 403 permissão, 404 `*_NOT_FOUND`
 *   e código de eleitor inexistente, 410 prazo vencido, 429 excesso de requisições, 500 erro
 *   interno e 409 para os demais erros de regra de negócio.
 */
export function statusForErrorCode(code: ErrorCode): number {
  // Sufixo em vez de lista: um novo `*_NOT_FOUND` do domínio já nasce como 404.
  if (code.endsWith('NOT_FOUND')) return NOT_FOUND;
  return STATUS_BY_CODE[code] ?? CONFLICT;
}
