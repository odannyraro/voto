import type { ErrorDTO, VoterStateDTO } from '@voto/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/api-client';
import { useSocket } from '../../api/socket-provider';
import { voterApi } from '../../api/voter-api';

/** Estado visível e falhas da sincronização da sessão do eleitor. */
export interface VoterSessionSnapshot {
  /** Último snapshot aceito por REST ou Socket.IO. */
  readonly state: VoterStateDTO | null;
  /** Indica que uma consulta inicial ou ressincronização está em andamento. */
  readonly isLoading: boolean;
  /** Erro REST validado pelo contrato compartilhado, quando disponível. */
  readonly error: ErrorDTO | null;
  /** Mensagem segura para falhas sem um DTO de erro conhecido. */
  readonly errorMessage: string | null;
}

/**
 * Carrega e mantém sincronizado o estado atual da sessão autenticada do eleitor.
 *
 * @param token - Token de eleitor da sessão, ou `null` quando não há credenciais.
 * @returns Snapshot mais recente, indicador de carregamento e eventual erro visível.
 */
export function useVoterSession(token: string | null): VoterSessionSnapshot {
  const { voterState, onReconnect } = useSocket();
  const [state, setState] = useState<VoterStateDTO | null>(null);
  const [isLoading, setIsLoading] = useState(token !== null);
  const [error, setError] = useState<ErrorDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token === null ? 'Voter session not found. Join an election again.' : null,
  );
  const requestVersion = useRef(0);
  const socketVersion = useRef(0);
  const synchronizeRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (voterState === null) {
      return;
    }

    socketVersion.current += 1;
    setState(voterState);
    setError(null);
    setErrorMessage(null);
    setIsLoading(false);
  }, [voterState]);

  useEffect(() => {
    if (token === null) {
      synchronizeRef.current = null;
      setState(null);
      setIsLoading(false);
      setError(null);
      setErrorMessage('Voter session not found. Join an election again.');
      return;
    }

    const sessionToken = token;
    let active = true;

    /**
     * Busca um snapshot sem permitir que respostas antigas sobrescrevam eventos mais novos.
     *
     * @returns Resolve quando a consulta REST atualiza o snapshot ou apresenta um erro.
     */
    async function synchronize(): Promise<void> {
      const currentRequest = ++requestVersion.current;
      const currentSocketVersion = socketVersion.current;
      setIsLoading(true);

      try {
        const nextState = await voterApi.getState(sessionToken);
        if (
          !active ||
          currentRequest !== requestVersion.current ||
          currentSocketVersion !== socketVersion.current
        ) {
          return;
        }

        setState(nextState);
        setError(null);
        setErrorMessage(null);
      } catch (requestError: unknown) {
        if (
          !active ||
          currentRequest !== requestVersion.current ||
          currentSocketVersion !== socketVersion.current
        ) {
          return;
        }

        if (requestError instanceof ApiError && requestError.error !== undefined) {
          setError({ error: requestError.error });
          setErrorMessage(null);
        } else {
          setError(null);
          setErrorMessage('Unable to load voter session. Please try again.');
        }
      } finally {
        if (
          active &&
          currentRequest === requestVersion.current &&
          currentSocketVersion === socketVersion.current
        ) {
          setIsLoading(false);
        }
      }
    }

    synchronizeRef.current = synchronize;
    void synchronize();

    return () => {
      active = false;
      requestVersion.current += 1;
      synchronizeRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const unsubscribe = onReconnect(() => {
      void synchronizeRef.current?.();
    });

    return unsubscribe;
  }, [onReconnect]);

  return { state, isLoading, error, errorMessage };
}
