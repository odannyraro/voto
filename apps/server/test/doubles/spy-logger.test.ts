import { describe, expect, it } from 'vitest';
import { SpyLogger } from './spy-logger';

describe('SpyLogger', () => {
  it('records each error with its context and message', () => {
    const logger = new SpyLogger();

    logger.error({ electionId: 'e1' }, 'first failure');
    logger.error({ electionId: 'e2' }, 'second failure');

    expect(logger.errors).toEqual([
      { context: { electionId: 'e1' }, message: 'first failure' },
      { context: { electionId: 'e2' }, message: 'second failure' },
    ]);
  });

  it('starts without errors', () => {
    const logger = new SpyLogger();

    expect(logger.errors).toEqual([]);
  });
});
