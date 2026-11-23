import { describe, expect, it } from 'vitest';
import { createElection } from '@voto/domain';

describe('server integration with the real domain', () => {
  it('creates an election through the domain public API', () => {
    const ctx = { now: new Date('2026-01-01T00:00:00Z'), newId: () => 'election-1' };

    const result = createElection({ adminId: 'admin-1', name: 'Student Council' }, ctx);

    expect(result).toMatchObject({
      ok: true,
      value: { id: 'election-1', adminId: 'admin-1', name: 'Student Council', status: 'DRAFT' },
    });
  });
});
