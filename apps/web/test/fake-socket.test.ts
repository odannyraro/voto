import { describe, expect, it } from 'vitest';
import { createFakeSocket } from './utils/fake-socket';
import { makeVoterStateDTO } from './utils/factories';

describe('createFakeSocket', () => {
  it('connects and disconnects while only delivering events when connected', () => {
    const socket = createFakeSocket();
    const receivedPhases: string[] = [];
    socket.onVoterState((state) => receivedPhases.push(state.phase));
    socket.disconnect();
    socket.emitVoterState(makeVoterStateDTO({ phase: 'WAITING' }));
    socket.connect();
    socket.emitVoterState(makeVoterStateDTO({ phase: 'VOTING' }));
    socket.disconnect();
    socket.emitVoterState(makeVoterStateDTO({ phase: 'FINISHED' }));

    expect({ receivedPhases, connected: socket.connected }).toEqual({
      receivedPhases: ['VOTING'],
      connected: false,
    });
  });
});
