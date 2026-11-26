import {
  SOCKET_EVENTS,
  type AdminElectionDTO,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type VoterStateDTO,
} from '@voto/shared';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = '/';

/** Conexão Socket.IO tipada consumida pelo cliente realtime. */
export interface SocketConnection {
  /**
   * Inscreve um ouvinte no estado administrativo.
   *
   * @param listener - Recebe o estado administrativo completo.
   */
  onAdminState(listener: (state: AdminElectionDTO) => void): void;
  /**
   * Remove um ouvinte do estado administrativo.
   *
   * @param listener - O mesmo ouvinte previamente registrado.
   */
  offAdminState(listener: (state: AdminElectionDTO) => void): void;
  /**
   * Inscreve um ouvinte no estado do eleitor.
   *
   * @param listener - Recebe a fase atual do eleitor.
   */
  onVoterState(listener: (state: VoterStateDTO) => void): void;
  /**
   * Remove um ouvinte do estado do eleitor.
   *
   * @param listener - O mesmo ouvinte previamente registrado.
   */
  offVoterState(listener: (state: VoterStateDTO) => void): void;
  /**
   * Inscreve um ouvinte chamado após uma reconexão bem-sucedida.
   *
   * @param listener - Ação executada quando o transporte retoma a conexão.
   */
  onReconnect(listener: () => void): void;
  /**
   * Remove um ouvinte de reconexão previamente registrado.
   *
   * @param listener - O mesmo ouvinte previamente registrado.
   */
  offReconnect(listener: () => void): void;
  /**
   * Pede ao servidor para observar uma eleição como admin.
   *
   * @param payload - Identificador da eleição a observar.
   */
  watchAdmin(payload: { readonly electionId: string }): void;
  /** Encerra a conexão Socket.IO. */
  disconnect(): void;
}

/** Opções de autenticação enviadas no handshake Socket.IO. */
export interface SocketConnectionOptions {
  /** Token validado pelo servidor antes de aceitar a conexão. */
  readonly auth: { readonly token: string };
}

/**
 * Cria uma conexão Socket.IO para o URL e as opções recebidas.
 *
 * @param url - URL da origem usada pelo cliente Socket.IO.
 * @param options - Credenciais e opções de handshake.
 * @returns Conexão tipada pelos eventos compartilhados.
 */
export type SocketConnectionFactory = (
  url: string,
  options: SocketConnectionOptions,
) => SocketConnection;

/** Configuração opcional do cliente Socket.IO. */
export interface SocketClientOptions {
  /** URL da origem Socket.IO; padrão é a mesma origem da aplicação. */
  readonly url?: string;
  /** Fábrica substituível para testes isolados da fronteira. */
  readonly connectionFactory?: SocketConnectionFactory;
}

/** API tipada que as telas usam para observar estados realtime. */
export interface SocketClient {
  /**
   * Pede ao servidor para enviar o estado atual de uma eleição.
   *
   * @param electionId - Identificador da eleição a observar.
   */
  watchAdmin(electionId: string): void;
  /**
   * Escuta estados administrativos completos.
   *
   * @param listener - Callback que recebe cada estado da eleição.
   * @returns Função que remove somente este ouvinte.
   */
  onAdminState(listener: (state: AdminElectionDTO) => void): () => void;
  /**
   * Escuta atualizações do estado visível ao eleitor.
   *
   * @param listener - Callback que recebe cada fase do eleitor.
   * @returns Função que remove somente este ouvinte.
   */
  onVoterState(listener: (state: VoterStateDTO) => void): () => void;
  /**
   * Escuta reconexões para permitir que a tela recarregue o estado atual do servidor.
   *
   * @param listener - Ação executada após uma reconexão bem-sucedida.
   * @returns Função que remove somente este ouvinte.
   */
  onReconnect(listener: () => void): () => void;
  /** Remove os ouvintes ativos e encerra a conexão. */
  disconnect(): void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Adapta a instância Socket.IO aos métodos da fronteira usada pelo cliente.
 *
 * @param url - URL da origem usada pelo cliente Socket.IO.
 * @param options - Credenciais e opções de handshake.
 * @returns Conexão Socket.IO tipada.
 */
function createSocketConnection(url: string, options: SocketConnectionOptions): SocketConnection {
  const socket: TypedSocket = io(url, {
    auth: options.auth,
  });
  let hasConnected = false;
  const reconnectListeners = new Set<() => void>();
  /** Aguarda a reconexão do namespace autenticado antes de solicitar ressincronização. */
  const handleConnect = (): void => {
    if (hasConnected) {
      reconnectListeners.forEach((listener) => listener());
    }
    hasConnected = true;
  };
  socket.on('connect', handleConnect);

  return {
    onAdminState: (listener) => socket.on(SOCKET_EVENTS.ADMIN_STATE, listener),
    offAdminState: (listener) => socket.off(SOCKET_EVENTS.ADMIN_STATE, listener),
    onVoterState: (listener) => socket.on(SOCKET_EVENTS.VOTER_STATE, listener),
    offVoterState: (listener) => socket.off(SOCKET_EVENTS.VOTER_STATE, listener),
    onReconnect: (listener) => {
      reconnectListeners.add(listener);
    },
    offReconnect: (listener) => {
      reconnectListeners.delete(listener);
    },
    watchAdmin: (payload) => socket.emit(SOCKET_EVENTS.ADMIN_WATCH, payload),
    disconnect: () => {
      socket.off('connect', handleConnect);
      socket.disconnect();
    },
  };
}

/**
 * Cria um cliente Socket.IO tipado para estado realtime e detecção de reconexões.
 *
 * @param token - Token de admin ou eleitor usado no handshake.
 * @param options - URL e fábrica opcional da conexão realtime.
 * @returns Cliente para observar estados, assistir eleições e detectar reconexões.
 */
export function createSocketClient(token: string, options: SocketClientOptions = {}): SocketClient {
  const connectionFactory = options.connectionFactory ?? createSocketConnection;
  const connection = connectionFactory(options.url ?? SOCKET_URL, { auth: { token } });
  const subscriptions = new Set<() => void>();

  /**
   * Registra o ouvinte e mantém seu descarte junto à conexão.
   *
   * @param listener - Ouvinte de estado a registrar.
   * @param subscribe - Operação que associa o ouvinte à conexão.
   * @param unsubscribeFromConnection - Operação que remove o ouvinte da conexão.
   * @returns Função idempotente que remove o ouvinte.
   */
  function subscribe<T>(
    listener: (state: T) => void,
    subscribeToConnection: (handler: (state: T) => void) => void,
    unsubscribeFromConnection: (handler: (state: T) => void) => void,
  ): () => void {
    subscribeToConnection(listener);
    let active = true;

    const unsubscribe = (): void => {
      if (!active) {
        return;
      }

      active = false;
      unsubscribeFromConnection(listener);
      subscriptions.delete(unsubscribe);
    };

    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  /**
   * Registra e acompanha um ouvinte de reconexão junto à vida do cliente.
   *
   * @param listener - Ação executada pelo cliente após a reconexão.
   * @returns Função idempotente que remove o ouvinte.
   */
  function subscribeToReconnect(listener: () => void): () => void {
    connection.onReconnect(listener);
    let active = true;

    const unsubscribe = (): void => {
      if (!active) {
        return;
      }

      active = false;
      connection.offReconnect(listener);
      subscriptions.delete(unsubscribe);
    };

    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  return {
    watchAdmin: (electionId) => connection.watchAdmin({ electionId }),
    onAdminState: (listener) =>
      subscribe(
        listener,
        (handler) => connection.onAdminState(handler),
        (handler) => connection.offAdminState(handler),
      ),
    onVoterState: (listener) =>
      subscribe(
        listener,
        (handler) => connection.onVoterState(handler),
        (handler) => connection.offVoterState(handler),
      ),
    onReconnect: subscribeToReconnect,
    disconnect: () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      connection.disconnect();
    },
  };
}
