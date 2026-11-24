import type { AddressInfo } from 'node:net';
import type { ClientToServerEvents, ServerToClientEvents } from '@voto/shared';
import { io as connectClient, type Socket } from 'socket.io-client';
import { onTestFinished } from 'vitest';
import { SocketNotifier } from '../../src/adapters/socket-notifier';
import { createRealtimeServer } from '../../src/realtime/gateway';
import { appWithTwoAdmins, type TwoAdminsTestApp } from './admin-test-app';

/** Cliente Socket.IO tipado com os eventos de `@voto/shared`. */
export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Tempo máximo de espera por um evento antes de o teste falhar. */
const EVENT_TIMEOUT_MS = 2000;

/** App de teste escutando numa porta de verdade, com o gateway e o `SocketNotifier` reais. */
export interface RealtimeTestApp extends TwoAdminsTestApp {
  /** O notificador real ligado ao gateway (o `notifier` herdado é o mesmo objeto). */
  readonly socketNotifier: SocketNotifier;
  /**
   * Abre um cliente Socket.IO, fechado sozinho ao fim do teste.
   *
   * @param token - JWT enviado no handshake (`undefined` = sem token).
   * @returns O cliente, ainda conectando.
   */
  readonly connect: (token?: string) => ClientSocket;
}

/**
 * Sobe o app com o gateway Socket.IO numa porta efêmera. App e clientes são fechados ao fim
 * do teste que o criou, então só pode ser chamado de dentro de um teste.
 *
 * @returns O app de teste, as admins Ana e Bia e a fábrica de clientes.
 */
export async function startRealtimeApp(): Promise<RealtimeTestApp> {
  const io = createRealtimeServer();
  const socketNotifier = new SocketNotifier(io);
  const test = await appWithTwoAdmins({ realtime: io, notifier: socketNotifier });
  await test.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = test.app.server.address() as AddressInfo;

  const clients: ClientSocket[] = [];
  onTestFinished(() => {
    clients.forEach((client) => client.disconnect());
  });
  const connect = (token?: string): ClientSocket => {
    const client: ClientSocket = connectClient(`http://127.0.0.1:${port}`, {
      auth: token === undefined ? {} : { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    return client;
  };
  return { ...test, socketNotifier, connect };
}

/**
 * Espera o próximo evento do servidor, sem `sleep`: a Promise resolve quando o evento chega
 * e rejeita se ele não chegar a tempo.
 *
 * @param socket - Cliente que deve receber o evento.
 * @param event - Nome do evento.
 * @returns O payload do evento.
 */
export function waitForEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${event}"`));
    }, EVENT_TIMEOUT_MS);
    const listener = (payload: Parameters<ServerToClientEvents[E]>[0]): void => {
      clearTimeout(timer);
      resolve(payload);
    };
    // O Socket.IO não consegue inferir o ouvinte a partir de um nome genérico.
    socket.once(event, listener as never);
  });
}

/**
 * Espera a recusa da conexão pelo servidor.
 *
 * @param socket - Cliente que tentou conectar.
 * @returns O erro recebido em `connect_error`.
 */
export function waitForConnectError(socket: ClientSocket): Promise<Error> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for "connect_error"'));
    }, EVENT_TIMEOUT_MS);
    socket.once('connect', () => {
      clearTimeout(timer);
      reject(new Error('Connection was accepted'));
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      resolve(error);
    });
  });
}

/**
 * Conecta um cliente e espera o servidor aceitar o handshake.
 *
 * @param socket - Cliente recém-criado por `connect`.
 * @returns O mesmo cliente, já conectado.
 */
export function connected(socket: ClientSocket): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      resolve(socket);
    });
    socket.once('connect_error', reject);
  });
}

/**
 * Guarda todos os payloads de um evento recebidos pelo cliente, para checar depois o que
 * **não** deveria ter chegado (com um evento sentinela que marca o fim da espera).
 *
 * @param socket - Cliente observado.
 * @param event - Nome do evento.
 * @returns Lista preenchida à medida que os eventos chegam.
 */
export function collectEvents<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
): Parameters<ServerToClientEvents[E]>[0][] {
  const received: Parameters<ServerToClientEvents[E]>[0][] = [];
  const listener = (payload: Parameters<ServerToClientEvents[E]>[0]): void => {
    received.push(payload);
  };
  socket.on(event, listener as never);
  return received;
}
