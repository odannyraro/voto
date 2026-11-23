import { describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES } from '@voto/domain';
import { ERROR_CODES } from '@voto/shared';

describe('error code contract between domain and shared', () => {
  it('lists every domain error code in the shared catalog', () => {
    expect(ERROR_CODES).toEqual(expect.arrayContaining([...DOMAIN_ERROR_CODES]));
  });
});
