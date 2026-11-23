import type { ErrorCode } from '@voto/shared';
import { statusForErrorCode } from './error-status';

/** Erro esperado da borda (HTTP) ou dos adaptadores, já com o status e o código da API. */
export class HttpError extends Error {
  /**
   * @param status - Status HTTP da resposta.
   * @param code - Código de erro da API (`ErrorDTO.error.code`).
   * @param message - Explicação legível, em inglês.
   */
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Cria um `HttpError` cujo status vem da tabela da §6.3 (`statusForErrorCode`), para que
 * nenhum ponto do servidor repita o status à mão e divirja da tabela.
 *
 * @param code - Código de erro da API.
 * @param message - Explicação legível, em inglês.
 * @returns O erro pronto para ser lançado.
 */
export function httpErrorFor(code: ErrorCode, message: string): HttpError {
  return new HttpError(statusForErrorCode(code), code, message);
}
