import { openRoundBodySchema, type AdminElectionDTO, type OpenRoundBody } from '@voto/shared';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { Countdown } from '../../../components/Countdown';
import { useAdminElection } from './useAdminElection';

/** Propriedades para controlar ao vivo uma eleição acompanhada pelo socket. */
export interface AdminLivePanelProps {
  readonly token: string;
  readonly electionId: string;
}

/**
 * Apresenta prontidão da fila e controles de abertura/fechamento de rodada.
 *
 * @param props - Credenciais e eleição que deve ser controlada.
 * @returns Estado sincronizado, prazo, progresso e ações REST disponíveis.
 */
export function AdminLivePanel({ token, electionId }: AdminLivePanelProps): ReactElement {
  const { state, clientNowAtSync, isLoading, errorMessage, acceptState } = useAdminElection(
    token,
    electionId,
  );
  const [duration, setDuration] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  /**
   * Abre a rodada do próximo cargo usando a duração validada ou a padrão da eleição.
   *
   * @param event - Envio do formulário de abertura.
   * @returns Promise resolvida após validar e enviar a mutação.
   */
  async function handleOpenRound(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state === null || state.next.positionId === undefined) {
      return;
    }

    const body: OpenRoundBody = {
      positionId: state.next.positionId,
      ...(duration.trim() === '' ? {} : { durationSeconds: Number(duration) }),
    };
    const parsedBody = openRoundBodySchema.safeParse(body);
    if (!parsedBody.success) {
      setValidationMessage('Round duration must be a whole number from 5 to 3600 seconds.');
      return;
    }

    setValidationMessage(null);
    setMutationError(null);
    setIsMutating(true);
    try {
      acceptState(await adminApi.openRound(token, electionId, parsedBody.data));
    } catch (error: unknown) {
      setMutationError(getRequestErrorMessage(error, 'Unable to open the voting round.'));
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Fecha a rodada atualmente apresentada pelo snapshot sincronizado.
   *
   * @param currentState - Estado cuja rodada aberta será fechada.
   * @returns Promise resolvida após aplicar o estado retornado pela API.
   */
  async function handleCloseRound(currentState: AdminElectionDTO): Promise<void> {
    const roundId = currentState.currentRound?.roundId;
    if (roundId === undefined) {
      return;
    }

    setMutationError(null);
    setIsMutating(true);
    try {
      acceptState(await adminApi.closeRound({ token, electionId, roundId }));
    } catch (error: unknown) {
      setMutationError(getRequestErrorMessage(error, 'Unable to close the voting round.'));
    } finally {
      setIsMutating(false);
    }
  }

  if (isLoading && state === null) {
    return <p role="status">Loading live election state...</p>;
  }

  if (errorMessage !== null && state === null) {
    return <p role="alert">{errorMessage}</p>;
  }

  if (state === null) {
    return <p role="status">Waiting for election state...</p>;
  }

  const nextPosition = state.election.positions.find(({ id }) => id === state.next.positionId);
  const currentRound = state.currentRound;

  return (
    <section aria-labelledby="live-election-heading">
      <h2 id="live-election-heading">Live election</h2>
      {(errorMessage !== null || mutationError !== null) && (
        <p role="alert">{mutationError ?? errorMessage}</p>
      )}
      {state.next.status === 'READY' && (
        <>
          {nextPosition !== undefined && <p>Ready to open: {nextPosition.title}</p>}
          {state.election.status !== 'OPEN' ? (
            <p>Open the election before starting a voting round.</p>
          ) : (
            <form noValidate onSubmit={handleOpenRound}>
              <label htmlFor="round-duration">Round duration (seconds)</label>
              <input
                id="round-duration"
                type="number"
                min={5}
                max={3600}
                step={1}
                value={duration}
                onChange={(event) => setDuration(event.currentTarget.value)}
              />
              {validationMessage !== null && <p role="alert">{validationMessage}</p>}
              <button type="submit" disabled={isMutating || state.next.positionId === undefined}>
                {isMutating ? 'Opening round...' : 'Open round'}
              </button>
            </form>
          )}
        </>
      )}
      {state.next.status === 'ROUND_IN_PROGRESS' && currentRound !== undefined && (
        <>
          <p>Voting in progress: {currentRound.positionTitle}</p>
          <p>
            Votes: {currentRound.votedCount} of {currentRound.eligibleCount}
          </p>
          <p>Voting deadline: {currentRound.deadline}</p>
          {clientNowAtSync !== null && (
            <Countdown
              clock={{
                deadline: currentRound.deadline,
                serverNow: state.serverNow,
                clientNowAtSync,
              }}
            />
          )}
          <button type="button" disabled={isMutating} onClick={() => void handleCloseRound(state)}>
            {isMutating ? 'Closing round...' : 'Close round early'}
          </button>
        </>
      )}
      {state.next.status === 'ROUND_IN_PROGRESS' && currentRound === undefined && (
        <p role="alert">The server reports an active round but did not provide its state.</p>
      )}
      {state.next.status === 'INSUFFICIENT_CANDIDATES' && (
        <p>The next position needs more candidates before a round can start.</p>
      )}
      {state.next.status === 'AWAITING_RUNOFF' && <p>The next position is awaiting a runoff.</p>}
      {state.next.status === 'NONE_LEFT' && <p>No positions remain in the queue.</p>}
    </section>
  );
}

/**
 * Converte falhas REST em mensagens visíveis sem apresentar sucesso falso.
 *
 * @param error - Falha recebida na chamada da API.
 * @param fallback - Mensagem para falha sem payload de API.
 * @returns Código/mensagem do servidor ou mensagem alternativa explícita.
 */
function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.error !== undefined) {
    return `${error.error.code}: ${error.error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
