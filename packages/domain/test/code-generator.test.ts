import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH, createCodeGenerator } from '../src/index';

/**
 * Fonte de "aleatoriedade" que devolve índices fixos, em ciclo.
 *
 * @param indices - Índices devolvidos, um por chamada.
 * @returns Função no formato esperado por `createCodeGenerator`.
 */
function cyclingSource(indices: readonly number[]) {
  let call = 0;
  return (): number => {
    const index = indices[call % indices.length] ?? 0;
    call += 1;
    return index;
  };
}

describe('createCodeGenerator', () => {
  it('builds each code from eight characters picked by the random source', () => {
    const generator = createCodeGenerator(cyclingSource([0, 1, 2, 3, 4, 5, 6, 7]));

    const code = generator.generate();

    expect(code).toBe('ABCDEFGH');
  });

  it('can pick the last character of the alphabet', () => {
    const lastIndex = CODE_ALPHABET.length - 1;
    const generator = createCodeGenerator(cyclingSource([lastIndex]));

    const code = generator.generate();

    expect(code).toBe('99999999');
  });

  it('asks the random source for indices below the alphabet size', () => {
    const requestedLimits: number[] = [];
    const generator = createCodeGenerator((maxExclusive) => {
      requestedLimits.push(maxExclusive);
      return 0;
    });

    generator.generate();

    expect(new Set(requestedLimits)).toEqual(new Set([CODE_ALPHABET.length]));
  });

  it('fails loudly when the random source returns an index outside the alphabet', () => {
    const generator = createCodeGenerator(() => CODE_ALPHABET.length);

    expect(() => generator.generate()).toThrow(RangeError);
  });
});

describe('CODE_ALPHABET', () => {
  it('leaves out characters that are easy to confuse when typed', () => {
    const ambiguous = ['0', 'O', '1', 'I', 'L'];

    expect(ambiguous.filter((char) => CODE_ALPHABET.includes(char))).toEqual([]);
  });

  it('defines codes with eight characters', () => {
    expect(CODE_LENGTH).toBe(8);
  });
});
