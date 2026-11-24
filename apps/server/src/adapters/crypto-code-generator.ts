import { randomInt } from 'node:crypto';
import { createCodeGenerator } from '@voto/domain';
import type { CodeGenerator } from '../ports';

/**
 * Cria o gerador de códigos de eleitor usado em produção: o formato é do domínio e a
 * aleatoriedade vem do `crypto`, que é imprevisível (um código adivinhável daria acesso
 * ao voto de outra pessoa).
 *
 * @returns Um `CodeGenerator` que produz códigos de 8 caracteres do alfabeto sem ambíguos.
 */
export function createCryptoCodeGenerator(): CodeGenerator {
  return createCodeGenerator((maxExclusive) => randomInt(maxExclusive));
}
