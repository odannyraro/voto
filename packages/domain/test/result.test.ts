import { describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES, DomainError, fail, ok } from '../src/index';

describe('Result', () => {
  it('wraps a success value', () => {
    const result = ok('value');

    expect(result).toEqual({ ok: true, value: 'value' });
  });

  it('wraps a failure as a DomainError carrying the error code', () => {
    const result = fail('ROUND_NOT_OPEN', 'Round is closed');

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'ROUND_NOT_OPEN', message: 'Round is closed' }),
    });
  });

  it('builds failures whose error is an instance of DomainError', () => {
    const result = fail('ROUND_NOT_OPEN', 'Round is closed');

    expect(result).toEqual({ ok: false, error: expect.any(DomainError) });
  });
});

describe('DOMAIN_ERROR_CODES', () => {
  it('lists each code only once', () => {
    const uniqueCodes = new Set(DOMAIN_ERROR_CODES);

    expect(uniqueCodes.size).toBe(DOMAIN_ERROR_CODES.length);
  });

  it('uses UPPER_SNAKE_CASE for every code', () => {
    const invalidCodes = DOMAIN_ERROR_CODES.filter((code) => !/^[A-Z]+(_[A-Z]+)*$/.test(code));

    expect(invalidCodes).toEqual([]);
  });
});
