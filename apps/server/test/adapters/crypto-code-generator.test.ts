import { CODE_ALPHABET, CODE_LENGTH } from '@voto/domain';
import { describe, expect, it } from 'vitest';
import { createCryptoCodeGenerator } from '../../src/adapters/crypto-code-generator';

const SAMPLE_SIZE = 200;

describe('createCryptoCodeGenerator', () => {
  it('generates codes of the agreed length made only of unambiguous alphabet characters', () => {
    const generator = createCryptoCodeGenerator();
    const codePattern = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

    const codes = Array.from({ length: SAMPLE_SIZE }, () => generator.generate());

    expect(codes).toEqual(Array(SAMPLE_SIZE).fill(expect.stringMatching(codePattern)));
  });

  it('generates different codes across calls', () => {
    const generator = createCryptoCodeGenerator();

    const codes = new Set(Array.from({ length: SAMPLE_SIZE }, () => generator.generate()));

    // 31^8 combinações: uma colisão em 200 amostras indicaria fonte não aleatória.
    expect(codes.size).toBe(SAMPLE_SIZE);
  });
});
