import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';
import { createSocketClient, type SocketClient } from './socket-client';

/** Valores realtime disponíveis para componentes dentro do provider. */
export interface SocketContextValue {
  readonly adminState: AdminElectionDTO | null;
  readonly voterState: VoterStateDTO | null;
  /**
   * Registra um ouvinte chamado no recebimento de cada snapshot do eleitor.
   *
   * @param listener - Recebe o snapshot completo do eleitor.
   * @returns Função que remove o ouvinte.
   */
  onVoterState(listener: (state: VoterStateDTO) => void): () => void;
  /**
   * Registra uma ação para ressincronizar estado após reconexão do transporte.
   *
   * @param listener - Ação executada após uma reconexão bem-sucedida.
   * @returns Função que remove o ouvinte.
   */
  onReconnect(listener: () => void): () => void;
  /**
   * Solicita ao servidor acompanhar uma eleição como admin.
   *
   * @param electionId - Identificador da eleição observada pelo admin.
   */
  watchAdmin(electionId: string): void;
}

/** Opções de criação do provider Socket.IO. */
export interface SocketProviderProps extends PropsWithChildren {
  /** Token usado no handshake; sem ele, o provider não abre uma conexão. */
  readonly token: string | null;
  /** Fábrica do cliente realtime, substituível por fake nos testes. */
  readonly createClient?: (token: string) => SocketClient;
}

const SocketContext = createContext<SocketContextValue | null>(null);

/**
 * Compartilha o estado recebido pelo Socket.IO com os componentes da aplicação.
 *
 * @param props - Token da sessão, fábrica injetável do cliente e conteúdo filho.
 * @returns Conteúdo sob o contexto realtime.
 */
export function SocketProvider({
  children,
  token,
  createClient = createSocketClient,
}: SocketProviderProps): ReactElement {
  const [client, setClient] = useState<SocketClient | null>(null);
  const [adminState, setAdminState] = useState<AdminElectionDTO | null>(null);
  const [voterState, setVoterState] = useState<VoterStateDTO | null>(null);

  useEffect(() => {
    setAdminState(null);
    setVoterState(null);
    if (token === null) {
      setClient(null);
      return;
    }

    const activeClient = createClient(token);
    setClient(activeClient);
    const unsubscribeAdmin = activeClient.onAdminState(setAdminState);
    const unsubscribeVoter = activeClient.onVoterState(setVoterState);

    return () => {
      unsubscribeAdmin();
      unsubscribeVoter();
      activeClient.disconnect();
    };
  }, [createClient, token]);

  const watchAdmin = useCallback(
    (electionId: string): void => {
      client?.watchAdmin(electionId);
    },
    [client],
  );
  const onReconnect = useCallback(
    (listener: () => void): (() => void) => client?.onReconnect(listener) ?? (() => undefined),
    [client],
  );
  const onVoterState = useCallback(
    (listener: (state: VoterStateDTO) => void): (() => void) =>
      client?.onVoterState(listener) ?? (() => undefined),
    [client],
  );
  const contextValue = useMemo(
    () => ({ adminState, voterState, watchAdmin, onReconnect, onVoterState }),
    [adminState, voterState, watchAdmin, onReconnect, onVoterState],
  );

  return <SocketContext.Provider value={contextValue}>{children}</SocketContext.Provider>;
}

/**
 * Retorna estado e ações realtime do provider mais próximo.
 *
 * @returns Contexto realtime atualmente disponível.
 */
export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (context === null) {
    throw new Error('useSocket must be used within a SocketProvider.');
  }

  return context;
}
