import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/http/validate';

const nameSchema = z.object({ name: z.string().trim().min(1) });

describe('parse', () => {
  it('returns the validated data with the schema transformations applied', () => {
    const result = parse(nameSchema, { name: '  Ana  ' });

    expect(result).toEqual({ name: 'Ana' });
  });

  it('throws a ZodError when the data does not match the schema', () => {
    expect(() => parse(nameSchema, { name: '' })).toThrow(z.ZodError);
  });
});
