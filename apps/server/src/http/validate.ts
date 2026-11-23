import type { z } from 'zod';

/**
 * Valida dados de entrada contra um schema Zod.
 *
 * @param schema - Schema do corpo, dos parâmetros ou da query esperados.
 * @param data - Dado cru recebido pela rota.
 * @returns O dado validado e tipado.
 * @throws {z.ZodError} Se o dado não obedece ao schema; o tratador global devolve 400.
 */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}
