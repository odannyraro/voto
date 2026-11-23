import type { ErrorCode } from '@voto/shared';

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
