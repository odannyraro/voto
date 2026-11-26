// @vitest-environment node

import { createServer } from 'node:http';
import {
  SOCKET_EVENTS,
  type AdminElectionDTO,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type VoterStateDTO,
} from '@voto/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { Server as SocketIoServer } from 'socket.io';
import { createSocketClient, type SocketClient } from '../src/api/socket-client';
import { makeAdminElectionDTO, makeVoterStateDTO } from './utils/factories';

const SESSION_TOKEN = 'session-token';
const ELECTION_ID = 'election-1';

let socketServer: SocketIoServer<ClientToServerEvents, ServerToClientEvents> | undefined;
let socketClient: SocketClient | undefined;

describe('Socket.IO client integration', () => {
  afterEach(async () => {
    socketClient?.disconnect();
    if (socketServer !== undefined) {
      await new Promise<void>((resolve, reject) => {
        socketServer?.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }

    socketClient = undefined;
    socketServer = undefined;
  });

  it('authenticates, watches an election, receives both event DTOs, and disconnects', async () => {
    const httpServer = createServer();
    socketServer = new SocketIoServer<ClientToServerEvents, ServerToClientEvents>(httpServer);
    const adminState = makeAdminElectionDTO({
      next: { status: 'READY', positionId: 'position-1' },
    });
    const voterState = makeVoterStateDTO({ phase: 'WAITING' });
    let handshakeToken: unknown;

    const watchRequest = new Promise<string>((resolve) => {
      socketServer?.on('connection', (socket) => {
        handshakeToken = socket.handshake.auth['token'];
        socket.on(SOCKET_EVENTS.ADMIN_WATCH, ({ electionId }) => {
          resolve(electionId);
          socket.emit(SOCKET_EVENTS.ADMIN_STATE, adminState);
          socket.emit(SOCKET_EVENTS.VOTER_STATE, voterState);
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, resolve);
    });

    const address = httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the Socket.IO test server to listen on a TCP port.');
    }

    socketClient = createSocketClient(SESSION_TOKEN, {
      url: `http://127.0.0.1:${address.port}`,
    });
    const receivedAdminState = new Promise<AdminElectionDTO>((resolve) =>
      socketClient?.onAdminState(resolve),
    );
    const receivedVoterState = new Promise<VoterStateDTO>((resolve) =>
      socketClient?.onVoterState(resolve),
    );

    socketClient.watchAdmin(ELECTION_ID);
    const [watchedElectionId, adminStateReceived, voterStateReceived] = await Promise.all([
      watchRequest,
      receivedAdminState,
      receivedVoterState,
    ]);

    expect({
      token: handshakeToken,
      watchedElectionId,
      adminStateReceived,
      voterStateReceived,
    }).toEqual({
      token: SESSION_TOKEN,
      watchedElectionId: ELECTION_ID,
      adminStateReceived: adminState,
      voterStateReceived: voterState,
    });
  });
});
