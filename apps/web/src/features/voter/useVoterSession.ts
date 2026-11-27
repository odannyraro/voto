import type { ErrorDTO, VoterStateDTO } from '@voto/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/api-client';
import { useSocket } from '../../api/socket-provider';
import { voterApi } from '../../api/voter-api';

/** Estado visível e falhas da sincronização da sessão do eleitor. */
export interface VoterSessionSnapshot {
  /** Último snapshot aceito por REST ou Socket.IO. */
  readonly state: VoterStateDTO | null;
  /** Instante local em que o snapshot do servidor foi recebido. */
  readonly clientNowAtSync: string | null;
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
  const { onVoterState, onReconnect } = useSocket();
  const [state, setState] = useState<VoterStateDTO | null>(null);
  const [clientNowAtSync, setClientNowAtSync] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(token !== null);
  const [error, setError] = useState<ErrorDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token === null ? 'Sessão de eleitor não encontrada. Entre novamente com seu código.' : null,
  );
  const requestVersion = useRef(0);
  const socketVersion = useRef(0);
  const synchronizeRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return onVoterState((nextState) => {
      socketVersion.current += 1;
      setState(nextState);
      setClientNowAtSync(new Date().toISOString());
      setError(null);
      setErrorMessage(null);
      setIsLoading(false);
    });
  }, [onVoterState]);

  useEffect(() => {
    if (token === null) {
      synchronizeRef.current = null;
      setState(null);
      setClientNowAtSync(null);
      setIsLoading(false);
      setError(null);
      setErrorMessage('Sessão de eleitor não encontrada. Entre novamente com seu código.');
      return;
    }

    const sessionToken = token;
    let active = true;
    setState(null);
    setClientNowAtSync(null);

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
        setClientNowAtSync(new Date().toISOString());
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
          setErrorMessage('Não foi possível carregar sua sessão. Tente novamente.');
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

  return { state, clientNowAtSync, isLoading, error, errorMessage };
}
