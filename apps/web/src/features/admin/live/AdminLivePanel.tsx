import {
  openRoundBodySchema,
  type AdminElectionDTO,
  type OpenRoundBody,
  type RoundResultDTO,
} from '@voto/shared';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { Countdown } from '../../../components/Countdown';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { DoubleConfirmDialog } from '../../../components/DoubleConfirmDialog';
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
  const [roundToAnnul, setRoundToAnnul] = useState<RoundResultDTO | null>(null);
  const [positionToCancel, setPositionToCancel] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [isCancelConfirmationOpen, setIsCancelConfirmationOpen] = useState(false);

  /**
   * Executa uma ação administrativa e adota o snapshot completo do servidor.
   *
   * @param mutation - Operação REST que devolve o agregado atualizado da eleição.
   * @param fallback - Mensagem explícita para falhas sem corpo de erro da API.
   * @returns Promise resolvida após atualizar o estado ou exibir o erro da requisição.
   */
  async function applyMutation(
    mutation: () => Promise<AdminElectionDTO>,
    fallback: string,
  ): Promise<void> {
    setMutationError(null);
    setIsMutating(true);
    try {
      acceptState(await mutation());
    } catch (error: unknown) {
      setMutationError(getRequestErrorMessage(error, fallback));
    } finally {
      setIsMutating(false);
    }
  }

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

  /**
   * Confirma e anula a rodada fechada selecionada.
   *
   * @returns Promise resolvida quando o servidor devolve o estado atualizado da eleição.
   */
  async function annulSelectedRound(): Promise<void> {
    if (roundToAnnul === null) {
      return;
    }

    const roundId = roundToAnnul.roundId;
    setRoundToAnnul(null);
    await applyMutation(
      () => adminApi.annulRound({ token, electionId, roundId }),
      'Unable to annul the voting round.',
    );
  }

  /**
   * Cancela o cargo insuficiente selecionado após a confirmação exata do título.
   *
   * @returns Promise resolvida após aplicar o estado do servidor ou exibir seu erro.
   */
  async function cancelSelectedPosition(): Promise<void> {
    if (positionToCancel === null) {
      return;
    }

    const { id: positionId, title: confirmTitle } = positionToCancel;
    setIsCancelConfirmationOpen(false);
    setPositionToCancel(null);
    await applyMutation(
      () => adminApi.cancelPosition({ token, electionId, positionId, body: { confirmTitle } }),
      'Unable to cancel the position.',
    );
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
    <>
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
            <button
              type="button"
              disabled={isMutating}
              onClick={() => void handleCloseRound(state)}
            >
              {isMutating ? 'Closing round...' : 'Close round early'}
            </button>
          </>
        )}
        {state.next.status === 'ROUND_IN_PROGRESS' && currentRound === undefined && (
          <p role="alert">The server reports an active round but did not provide its state.</p>
        )}
        {state.next.status === 'INSUFFICIENT_CANDIDATES' && (
          <InsufficientCandidatesPanel
            state={state}
            isMutating={isMutating}
            onAttach={(positionId, candidateId) =>
              void applyMutation(
                () => adminApi.attachCandidate({ token, electionId, positionId, candidateId }),
                'Unable to attach the candidate.',
              )
            }
            onDefer={(positionId) =>
              void applyMutation(
                () => adminApi.deferPosition({ token, electionId, positionId }),
                'Unable to defer the position.',
              )
            }
            onCancel={(position) => setPositionToCancel(position)}
          />
        )}
        {state.next.status === 'AWAITING_RUNOFF' && <p>The next position is awaiting a runoff.</p>}
        {state.next.status === 'NONE_LEFT' && <p>No positions remain in the queue.</p>}
        {state.lastResult !== undefined && (
          <RoundResultPanel
            state={state}
            result={state.lastResult}
            isMutating={isMutating}
            onOpenRunoff={(positionId) =>
              void applyMutation(
                () => adminApi.openRunoff({ token, electionId, positionId, body: {} }),
                'Unable to open the runoff.',
              )
            }
            onRelease={(roundId) =>
              void applyMutation(
                () => adminApi.releaseRound({ token, electionId, roundId }),
                'Unable to release the round results.',
              )
            }
            onAnnul={setRoundToAnnul}
            onUndo={() =>
              void applyMutation(
                () => adminApi.undoElection(token, electionId),
                'Unable to undo the last election action.',
              )
            }
          />
        )}
      </section>
      <ConfirmDialog
        open={roundToAnnul !== null}
        title="Annul round?"
        description={
          roundToAnnul === null
            ? ''
            : `Annul the closed round for ${roundToAnnul.positionTitle}? The position will return to the queue.`
        }
        confirmLabel="Annul round"
        onConfirm={() => void annulSelectedRound()}
        onCancel={() => setRoundToAnnul(null)}
      />
      <ConfirmDialog
        open={positionToCancel !== null && !isCancelConfirmationOpen}
        title="Cancel position?"
        description={
          positionToCancel === null
            ? ''
            : `Cancel ${positionToCancel.title}? This position will be removed from the election.`
        }
        confirmLabel="Continue"
        onConfirm={() => setIsCancelConfirmationOpen(true)}
        onCancel={() => setPositionToCancel(null)}
      />
      <DoubleConfirmDialog
        open={isCancelConfirmationOpen && positionToCancel !== null}
        title="Confirm cancellation"
        description="Type the exact position title to cancel it."
        confirmationTitle={positionToCancel?.title ?? ''}
        confirmLabel="Cancel position"
        onConfirm={() => void cancelSelectedPosition()}
        onCancel={() => {
          setIsCancelConfirmationOpen(false);
          setPositionToCancel(null);
        }}
      />
    </>
  );
}

/** Propriedades para apresentar a resolução calculada pelo servidor. */
interface RoundResultPanelProps {
  readonly state: AdminElectionDTO;
  readonly result: RoundResultDTO;
  readonly isMutating: boolean;
  readonly onOpenRunoff: (positionId: string) => void;
  readonly onRelease: (roundId: string) => void;
  readonly onAnnul: (result: RoundResultDTO) => void;
  readonly onUndo: () => void;
}

/**
 * Apresenta a contagem oficial da última rodada e as ações válidas para ela.
 *
 * @param props - Resultado e snapshot oficial, estado das ações e callbacks REST.
 * @returns Resultado discriminado e controles permitidos pelo agregado.
 */
function RoundResultPanel({
  state,
  result,
  isMutating,
  onOpenRunoff,
  onRelease,
  onAnnul,
  onUndo,
}: RoundResultPanelProps): ReactElement {
  const round = state.election.rounds.find(({ id }) => id === result.roundId);
  const outcomeMessage = getOutcomeMessage(result);
  const canOpenRunoff =
    result.outcome === 'RUNOFF_REQUIRED' &&
    state.next.status === 'AWAITING_RUNOFF' &&
    state.next.positionId !== undefined &&
    outcomeMessage !== null;
  const runoffPositionId =
    canOpenRunoff && state.next.status === 'AWAITING_RUNOFF' ? state.next.positionId : undefined;

  return (
    <section aria-labelledby="last-round-result-heading">
      <h3 id="last-round-result-heading">Last round result</h3>
      <p>{outcomeMessage ?? 'The server result is missing required candidate details.'}</p>
      {result.counts.length === 0 ? (
        <p>No candidate votes were recorded.</p>
      ) : (
        <ul aria-label="Candidate vote counts">
          {result.counts.map(({ candidateId, name, votes }) => (
            <li key={candidateId}>
              {name}: {votes} votes
            </li>
          ))}
        </ul>
      )}
      <p>
        Valid votes: {result.validVotes}; blank votes: {result.blank}.
      </p>
      {result.tiebreakApplied && <p>The position tie-break rule determined the result.</p>}
      {result.outcome === 'RUNOFF_REQUIRED' &&
        state.next.status === 'AWAITING_RUNOFF' &&
        (canOpenRunoff ? (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => {
              if (runoffPositionId !== undefined) {
                onOpenRunoff(runoffPositionId);
              }
            }}
          >
            Open runoff
          </button>
        ) : (
          <p role="alert">The server result is missing runoff finalist details.</p>
        ))}
      {round === undefined ? (
        <p role="alert">The server result does not match a round in the election.</p>
      ) : (
        <>
          {round.resultsReleased ? (
            <p>Results released to voters.</p>
          ) : round.status === 'CLOSED' ? (
            <button type="button" disabled={isMutating} onClick={() => onRelease(round.id)}>
              Release results to voters
            </button>
          ) : null}
          {round.status === 'CLOSED' && (
            <button type="button" disabled={isMutating} onClick={() => onAnnul(result)}>
              Annul round
            </button>
          )}
        </>
      )}
      {state.canUndo && (
        <button type="button" disabled={isMutating} onClick={onUndo}>
          Undo last action
        </button>
      )}
    </section>
  );
}

/**
 * Define o resumo textual do desfecho do servidor sem recalcular a apuração.
 *
 * @param result - DTO da rodada encerrada devolvido pelo servidor.
 * @returns Resumo do desfecho ou `null` quando faltarem dados obrigatórios dos candidatos.
 */
function getOutcomeMessage(result: RoundResultDTO): string | null {
  switch (result.outcome) {
    case 'ELECTED': {
      const electedCandidate = result.counts.find(
        ({ candidateId }) => candidateId === result.electedCandidateId,
      );
      return electedCandidate === undefined ? null : `Candidate elected: ${electedCandidate.name}.`;
    }
    case 'RUNOFF_REQUIRED': {
      const finalists = result.runoffCandidateIds?.map(
        (candidateId) => result.counts.find(({ candidateId: id }) => id === candidateId)?.name,
      );
      return finalists?.every((name) => name !== undefined)
        ? `Runoff required between ${finalists[0]} and ${finalists[1]}.`
        : null;
    }
    case 'NO_VALID_VOTES':
      return 'No valid votes were cast.';
  }
}

/** Propriedades das ações disponíveis quando o cargo não tem candidatos aptos. */
interface InsufficientCandidatesPanelProps {
  readonly state: AdminElectionDTO;
  readonly isMutating: boolean;
  readonly onAttach: (positionId: string, candidateId: string) => void;
  readonly onDefer: (positionId: string) => void;
  readonly onCancel: (position: { id: string; title: string }) => void;
}

/**
 * Apresenta apenas ações de resolução para o cargo insuficiente no topo da fila.
 *
 * @param props - Estado oficial, estado de requisição e callbacks administrativos.
 * @returns Lista de candidatos anexáveis e ações de adiar/cancelar, ou erro de snapshot.
 */
function InsufficientCandidatesPanel({
  state,
  isMutating,
  onAttach,
  onDefer,
  onCancel,
}: InsufficientCandidatesPanelProps): ReactElement {
  const positionId = state.next.positionId;
  const position = state.election.positions.find(({ id }) => id === positionId);

  if (positionId === undefined || position === undefined) {
    return <p role="alert">The server did not provide the insufficient position details.</p>;
  }

  const attachableCandidates = state.next.attachableCandidates ?? [];

  return (
    <section aria-labelledby="insufficient-candidates-heading">
      <h3 id="insufficient-candidates-heading">Not enough candidates for: {position.title}</h3>
      {attachableCandidates.length === 0 ? (
        <p>No existing eligible candidates can be attached.</p>
      ) : (
        <ul aria-label="Attachable candidates">
          {attachableCandidates.map((candidate) => (
            <li key={candidate.id}>
              {candidate.name}
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onAttach(positionId, candidate.id)}
              >
                Attach {candidate.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={isMutating} onClick={() => onDefer(positionId)}>
        Defer {position.title}
      </button>
      <button
        type="button"
        disabled={isMutating}
        onClick={() => onCancel({ id: positionId, title: position.title })}
      >
        Cancel {position.title}
      </button>
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
