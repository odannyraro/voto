import { describe, expect, it } from 'vitest';
import { StubCodeGenerator } from './stub-code-generator';

describe('StubCodeGenerator', () => {
  it('returns the configured codes in order', () => {
    const generator = new StubCodeGenerator(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC']);

    const generated = [generator.generate(), generator.generate(), generator.generate()];

    expect(generated).toEqual(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC']);
  });

  it('fails loudly when the sequence is exhausted', () => {
    const generator = new StubCodeGenerator(['AAAAAAAA']);
    generator.generate();

    expect(() => generator.generate()).toThrow('no more codes');
  });
});
