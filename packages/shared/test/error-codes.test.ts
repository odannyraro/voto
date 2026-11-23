import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../src/index';

const UPPER_SNAKE_CASE = /^[A-Z]+(_[A-Z]+)*$/;

const SERVER_CODES = [
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'INVALID_TOKEN',
  'FORBIDDEN',
  'ELECTION_NOT_FOUND',
  'INVALID_CODE',
  'VERSION_CONFLICT',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
];

describe('ERROR_CODES', () => {
  it('lists every code only once', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it.each(ERROR_CODES)('writes %s in UPPER_SNAKE_CASE', (code) => {
    expect(code).toMatch(UPPER_SNAKE_CASE);
  });

  it('includes the codes raised by the server itself', () => {
    expect(ERROR_CODES).toEqual(expect.arrayContaining(SERVER_CODES));
  });
});
