import { describe, expect, it } from 'vitest';
import type { ErrorCode } from '@voto/shared';
import { statusForErrorCode } from '../../src/http/error-status';

describe('statusForErrorCode', () => {
  it.each<[ErrorCode, number]>([
    ['POSITION_NOT_FOUND', 404],
    ['CANDIDATE_NOT_FOUND', 404],
    ['VOTER_NOT_FOUND', 404],
    ['ROUND_NOT_FOUND', 404],
    ['ELECTION_NOT_FOUND', 404],
    ['NOT_FOUND', 404],
    ['INVALID_CODE', 404],
  ])('maps the missing resource %s to %i', (code, status) => {
    expect(statusForErrorCode(code)).toBe(status);
  });

  it.each<[ErrorCode, number]>([
    ['INVALID_CREDENTIALS', 401],
    ['INVALID_TOKEN', 401],
  ])('maps the authentication failure %s to %i', (code, status) => {
    expect(statusForErrorCode(code)).toBe(status);
  });

  it.each<[ErrorCode, number]>([
    ['FORBIDDEN', 403],
    ['VOTER_REVOKED', 403],
  ])('maps the permission failure %s to %i', (code, status) => {
    expect(statusForErrorCode(code)).toBe(status);
  });

  it.each<[ErrorCode, number]>([
    ['VALIDATION_ERROR', 400],
    ['ROUND_EXPIRED', 410],
    ['RATE_LIMITED', 429],
    ['INTERNAL_ERROR', 500],
  ])('maps the dedicated code %s to %i', (code, status) => {
    expect(statusForErrorCode(code)).toBe(status);
  });

  it.each<ErrorCode>([
    'VOTER_ALREADY_VOTED',
    'ROUND_NOT_OPEN',
    'CANDIDATE_ALREADY_ELECTED',
    'NOTHING_TO_UNDO',
    'INVALID_POSITION_TITLE',
    'VERSION_CONFLICT',
  ])('maps the business-rule conflict %s to 409', (code) => {
    expect(statusForErrorCode(code)).toBe(409);
  });
});
