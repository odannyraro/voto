import { DomainError, type DomainErrorCode } from './errors';

/** Resultado de um comando do domínio: o valor novo ou o erro de negócio que o impediu. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError };

/**
 * Embrulha um valor de sucesso.
 *
 * @param value - Valor produzido pelo comando.
 * @returns Um `Result` de sucesso com o valor.
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Cria um `Result` de falha com um erro de negócio.
 *
 * @param code - Código do catálogo de erros do domínio.
 * @param message - Explicação legível do motivo, em inglês.
 * @returns Um `Result` de falha com um `DomainError`.
 */
export function fail<T = never>(code: DomainErrorCode, message: string): Result<T> {
  return { ok: false, error: new DomainError(code, message) };
}
