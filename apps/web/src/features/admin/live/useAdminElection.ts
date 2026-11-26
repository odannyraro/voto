import type { AdminElectionDTO } from '@voto/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { adminApi } from '../../../api/admin-api';
import { useSocket } from '../../../api/socket-provider';

/** Estado administrativo sincronizado por REST e Socket.IO. */
export interface AdminElectionSnapshot {
  /** Último agregado completo aceito para a eleição observada. */
  readonly state: AdminElectionDTO | null;
  /** Instante local em que o estado do servidor chegou. */
  readonly clientNowAtSync: string | null;
  /** Indica uma leitura REST inicial ou de ressincronização. */
  readonly isLoading: boolean;
  /** Mensagem explícita de falha ao sincronizar. */
  readonly errorMessage: string | null;
  /** Substitui o snapshot por um agregado completo devolvido por uma mutação REST. */
  readonly acceptState: (state: AdminElectionDTO) => void;
}

/**
 * Carrega e acompanha o estado completo da eleição administrativa.
 *
 * @param token - Token administrativo validado.
 * @param electionId - Eleição que deve ser observada.
 * @returns Snapshot atual, momento de sincronização, carregamento e eventual erro.
 */
export function useAdminElection(token: string, electionId: string): AdminElectionSnapshot {
  const { adminState, watchAdmin, onReconnect } = useSocket();
  const [state, setState] = useState<AdminElectionDTO | null>(null);
  const [clientNowAtSync, setClientNowAtSync] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const socketVersion = useRef(0);
  const synchronizeRef = useRef<(() => Promise<void>) | null>(null);

  const synchronize = useCallback(async (): Promise<void> => {
    const requestId = ++requestVersion.current;
    const socketVersionAtRequest = socketVersion.current;
    setIsLoading(true);
    try {
      const currentState = await adminApi.getElection(token, electionId);
      if (currentState.election.id !== electionId) {
        throw new Error('The server returned a different election than requested.');
      }
      if (
        requestId !== requestVersion.current ||
        socketVersionAtRequest !== socketVersion.current
      ) {
        return;
      }

      setState(currentState);
      setClientNowAtSync(new Date().toISOString());
      setErrorMessage(null);
    } catch (error: unknown) {
      if (
        requestId !== requestVersion.current ||
        socketVersionAtRequest !== socketVersion.current
      ) {
        return;
      }
      setErrorMessage(
        error instanceof ApiError
          ? `${error.error?.code ?? 'API_ERROR'}: ${error.error?.message ?? error.message}`
          : 'Unable to load election state. Please check your connection and try again.',
      );
    } finally {
      if (
        requestId === requestVersion.current &&
        socketVersionAtRequest === socketVersion.current
      ) {
        setIsLoading(false);
      }
    }
  }, [electionId, token]);

  const acceptState = useCallback(
    (nextState: AdminElectionDTO): void => {
      if (nextState.election.id !== electionId) {
        return;
      }

      requestVersion.current += 1;
      socketVersion.current += 1;
      setState(nextState);
      setClientNowAtSync(new Date().toISOString());
      setIsLoading(false);
      setErrorMessage(null);
    },
    [electionId],
  );

  useEffect(() => {
    synchronizeRef.current = synchronize;
    watchAdmin(electionId);
    void synchronize();

    return () => {
      requestVersion.current += 1;
      synchronizeRef.current = null;
    };
  }, [electionId, synchronize, watchAdmin]);

  useEffect(() => {
    if (adminState === null || adminState.election.id !== electionId) {
      return;
    }

    acceptState(adminState);
  }, [acceptState, adminState, electionId]);

  useEffect(() => {
    return onReconnect(() => {
      watchAdmin(electionId);
      void synchronizeRef.current?.();
    });
  }, [electionId, onReconnect, watchAdmin]);

  return { state, clientNowAtSync, isLoading, errorMessage, acceptState };
}
