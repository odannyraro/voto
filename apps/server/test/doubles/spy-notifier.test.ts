import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import { SpyNotifier } from './spy-notifier';

const SERVER_NOW = '2026-01-01T12:00:00.000Z';

const WAITING: VoterStateDTO = { phase: 'WAITING', electionName: 'Council', serverNow: SERVER_NOW };
const FINISHED: VoterStateDTO = { phase: 'FINISHED', serverNow: SERVER_NOW };

const ADMIN_STATE: AdminElectionDTO = {
  election: {
    id: 'e1',
    adminId: 'admin-1',
    name: 'Council',
    status: 'DRAFT',
    defaultVotingSeconds: 60,
    positions: [],
    queue: [],
    candidates: [],
    voters: [],
    rounds: [],
    version: 0,
  },
  next: { status: 'NONE_LEFT' },
  canUndo: false,
  serverNow: SERVER_NOW,
};

describe('SpyNotifier', () => {
  it('records admin states with the election they were sent for', () => {
    const notifier = new SpyNotifier();

    notifier.adminState('e1', ADMIN_STATE);

    expect(notifier.adminStates).toEqual([{ electionId: 'e1', state: ADMIN_STATE }]);
  });

  it('records voter states in the order they were sent', () => {
    const notifier = new SpyNotifier();

    notifier.voterState('v1', WAITING);
    notifier.voterState('v2', FINISHED);

    expect(notifier.voterStates).toEqual([
      { voterId: 'v1', state: WAITING },
      { voterId: 'v2', state: FINISHED },
    ]);
  });

  it('keeps admin and voter calls apart', () => {
    const notifier = new SpyNotifier();

    notifier.voterState('v1', WAITING);

    expect(notifier.adminStates).toEqual([]);
  });
});
