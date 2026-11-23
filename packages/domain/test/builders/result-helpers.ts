import type { Result } from '../../src/index';

/**
 * Extrai o valor de um `Result` de sucesso, para encadear passos num teste sem `if`.
 *
 * @param result - Resultado que o teste espera ser de sucesso.
 * @returns O valor contido.
 * @throws {Error} Se o resultado for de falha; a mensagem traz o código do erro.
 */
export function valueOf<T>(result: Result<T>): T {
  if (!result.ok)
    throw new Error(`Expected success but got ${result.error.code}: ${result.error.message}`);
  return result.value;
}
