import type { Logger } from '../../src/ports';

/** Chamada registrada de `error`. */
export interface ErrorCall {
  readonly context: object;
  readonly message: string;
}

/** Logger de teste: não escreve nada, só guarda os erros registrados. */
export class SpyLogger implements Logger {
  readonly errors: ErrorCall[] = [];

  /**
   * Guarda o erro registrado.
   *
   * @param context - Dados estruturados do erro.
   * @param message - Descrição curta do que falhou.
   */
  error(context: object, message: string): void {
    this.errors.push({ context, message });
  }
}
