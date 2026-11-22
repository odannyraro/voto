import type { CodeGenerator } from '../context';

/**
 * Caracteres usados nos códigos de eleitor. Ficam de fora `0`/`O`, `1`/`I`/`L`, que se
 * confundem ao ler o código no papel e digitar no celular (architecture.md §5.5).
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Quantidade de caracteres de cada código de eleitor. */
export const CODE_LENGTH = 8;

/**
 * Fonte de aleatoriedade injetada: devolve um inteiro de 0 até `maxExclusive - 1`.
 * Em produção é `crypto.randomInt`; nos testes, uma sequência fixa.
 */
export type RandomIndexSource = (maxExclusive: number) => number;

/**
 * Cria o gerador de códigos de eleitor. A aleatoriedade vem de fora para o domínio
 * continuar puro e os testes, determinísticos.
 *
 * @param randomIndex - Fonte de índices aleatórios no intervalo [0, tamanho do alfabeto).
 * @returns Um `CodeGenerator` que produz códigos de `CODE_LENGTH` caracteres do `CODE_ALPHABET`.
 */
export function createCodeGenerator(randomIndex: RandomIndexSource): CodeGenerator {
  return {
    generate: () => Array.from({ length: CODE_LENGTH }, () => pickCharacter(randomIndex)).join(''),
  };
}

/**
 * Sorteia um caractere do alfabeto.
 *
 * @param randomIndex - Fonte de índices aleatórios.
 * @returns Um caractere de `CODE_ALPHABET`.
 * @throws {RangeError} Se a fonte devolver um índice fora do alfabeto (bug de quem a injetou).
 */
function pickCharacter(randomIndex: RandomIndexSource): string {
  const index = randomIndex(CODE_ALPHABET.length);
  const character = CODE_ALPHABET[index];
  if (character === undefined) {
    throw new RangeError(`Random source returned ${index}, outside 0..${CODE_ALPHABET.length - 1}`);
  }
  return character;
}
