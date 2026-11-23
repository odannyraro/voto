import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index';

describe('shared package', () => {
  it('exposes the product name used by both server and web', () => {
    expect(APP_NAME).toBe('Voto');
  });
});
