import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import type { SocketClient } from '../../src/api/socket-client';

/** Socket fake controlável para testes dos fluxos realtime do frontend. */
export interface FakeSocket extends SocketClient {
  /** Indica se o fake está conectado. */
  readonly connected: boolean;
  /** Eleições para as quais o fake recebeu pedidos de observação. */
  readonly watchedElections: readonly string[];
  /**
   * Simula uma conexão ou reconexão do socket.
   */
  connect(): void;
  /**
   * Simula a reconexão do socket após uma interrupção.
   */
  reconnect(): void;
  /**
   * Emite um pedido de acompanhamento administrativo.
   *
   * @param electionId - Eleição solicitada para acompanhamento.
   */
  watchAdmin(electionId: string): void;
  /** @param state - DTO administrativo completo enviado pelo fake. */
  emitAdminState(state: AdminElectionDTO): void;
  /** @param state - DTO de eleitor enviado pelo fake. */
  emitVoterState(state: VoterStateDTO): void;
}

/**
 * Cria um cliente Socket.IO falso e controlável, inicialmente conectado.
 *
 * @returns Socket com controles de conexão e emissão de DTOs válidos.
 */
export function createFakeSocket(): FakeSocket {
  let connected = true;
  const adminListeners = new Set<(state: AdminElectionDTO) => void>();
  const voterListeners = new Set<(state: VoterStateDTO) => void>();
  const reconnectListeners = new Set<() => void>();
  const watchedElections: string[] = [];

  return {
    get connected() {
      return connected;
    },
    get watchedElections() {
      return watchedElections;
    },
    connect() {
      connected = true;
    },
    reconnect() {
      connected = true;
      reconnectListeners.forEach((listener) => listener());
    },
    watchAdmin(electionId) {
      watchedElections.push(electionId);
    },
    onAdminState(listener) {
      adminListeners.add(listener);
      return () => adminListeners.delete(listener);
    },
    onVoterState(listener) {
      voterListeners.add(listener);
      return () => voterListeners.delete(listener);
    },
    onReconnect(listener) {
      reconnectListeners.add(listener);
      return () => reconnectListeners.delete(listener);
    },
    emitAdminState(state) {
      if (connected) {
        adminListeners.forEach((listener) => listener(state));
      }
    },
    emitVoterState(state) {
      if (connected) {
        voterListeners.forEach((listener) => listener(state));
      }
    },
    disconnect() {
      connected = false;
    },
  };
}
