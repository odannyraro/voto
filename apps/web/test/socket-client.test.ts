import { SOCKET_EVENTS, type AdminElectionDTO, type VoterStateDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import {
  createSocketClient,
  type SocketConnection,
  type SocketConnectionOptions,
} from '../src/api/socket-client';
import { makeAdminElectionDTO, makeVoterStateDTO } from './utils/factories';

const SESSION_TOKEN = 'session-token';
const ELECTION_ID = 'election-1';

/** Registra as operações tipadas enviadas pela fronteira realtime. */
class FakeSocketConnection implements SocketConnection {
  public readonly adminListeners = new Set<(state: AdminElectionDTO) => void>();
  public readonly voterListeners = new Set<(state: VoterStateDTO) => void>();
  public readonly emittedEvents: Array<{ event: string; payload: unknown }> = [];
  public disconnected = false;

  /** @param listener - Ouvinte inscrito no estado administrativo da eleição. */
  public onAdminState(listener: (state: AdminElectionDTO) => void): void {
    this.adminListeners.add(listener);
  }

  /** @param listener - Ouvinte removido do estado administrativo da eleição. */
  public offAdminState(listener: (state: AdminElectionDTO) => void): void {
    this.adminListeners.delete(listener);
  }

  /** @param listener - Ouvinte inscrito no estado do eleitor. */
  public onVoterState(listener: (state: VoterStateDTO) => void): void {
    this.voterListeners.add(listener);
  }

  /** @param listener - Ouvinte removido do estado do eleitor. */
  public offVoterState(listener: (state: VoterStateDTO) => void): void {
    this.voterListeners.delete(listener);
  }

  /** @param payload - Conteúdo do evento a registrar. */
  public watchAdmin(payload: { readonly electionId: string }): void {
    this.emittedEvents.push({ event: SOCKET_EVENTS.ADMIN_WATCH, payload });
  }

  /** Encerra a conexão realtime simulada. */
  public disconnect(): void {
    this.disconnected = true;
  }

  /** @param state - Estado administrativo enviado pelo servidor simulado. */
  public emitAdminState(state: AdminElectionDTO): void {
    this.adminListeners.forEach((listener) => listener(state));
  }

  /** @param state - Estado do eleitor enviado pelo servidor simulado. */
  public emitVoterState(state: VoterStateDTO): void {
    this.voterListeners.forEach((listener) => listener(state));
  }
}

/**
 * Cria um cliente ligado a uma conexão Socket.IO controlada.
 *
 * @param connection - Conexão devolvida pela fábrica simulada.
 * @returns Cliente, URL e opções do handshake observáveis no teste.
 */
function createTestClient(connection: FakeSocketConnection): {
  client: ReturnType<typeof createSocketClient>;
  url: string | undefined;
  options: SocketConnectionOptions | undefined;
} {
  let url: string | undefined;
  let options: SocketConnectionOptions | undefined;
  const client = createSocketClient(SESSION_TOKEN, {
    connectionFactory: (connectionUrl, connectionOptions) => {
      url = connectionUrl;
      options = connectionOptions;
      return connection;
    },
  });

  return { client, url, options };
}

describe('createSocketClient', () => {
  it('sends the session token in the connection handshake', () => {
    const connection = new FakeSocketConnection();
    const { url, options } = createTestClient(connection);

    expect({ url, options }).toEqual({
      url: '/',
      options: { auth: { token: SESSION_TOKEN } },
    });
  });

  it('asks the server to watch the requested admin election', () => {
    const connection = new FakeSocketConnection();
    const { client } = createTestClient(connection);

    client.watchAdmin(ELECTION_ID);

    expect(connection.emittedEvents).toEqual([
      { event: SOCKET_EVENTS.ADMIN_WATCH, payload: { electionId: ELECTION_ID } },
    ]);
  });

  it('delivers admin state events to the subscribed listener', () => {
    const connection = new FakeSocketConnection();
    const { client } = createTestClient(connection);
    const receivedStates: AdminElectionDTO[] = [];
    client.onAdminState((state) => receivedStates.push(state));
    const state = makeAdminElectionDTO({ next: { status: 'READY', positionId: 'position-1' } });

    connection.emitAdminState(state);

    expect(receivedStates).toEqual([state]);
  });

  it('delivers voter state events and removes the listener when unsubscribed', () => {
    const connection = new FakeSocketConnection();
    const { client } = createTestClient(connection);
    const receivedStates: VoterStateDTO[] = [];
    const unsubscribe = client.onVoterState((state) => receivedStates.push(state));
    const state = makeVoterStateDTO({ phase: 'VOTING' });

    connection.emitVoterState(state);
    unsubscribe();
    unsubscribe();
    connection.emitVoterState(makeVoterStateDTO({ phase: 'WAITING' }));

    expect(receivedStates).toEqual([state]);
  });

  it('removes all event listeners and closes the connection on disconnect', () => {
    const connection = new FakeSocketConnection();
    const { client } = createTestClient(connection);
    client.onAdminState(() => undefined);
    client.onVoterState(() => undefined);

    client.disconnect();

    expect({
      adminListeners: connection.adminListeners.size,
      voterListeners: connection.voterListeners.size,
      disconnected: connection.disconnected,
    }).toEqual({ adminListeners: 0, voterListeners: 0, disconnected: true });
  });
});
