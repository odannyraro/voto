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
import { getApiErrorMessage } from '../../../lib/ui-messages';
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
      setValidationMessage(
        'A duração da votação deve ser um número inteiro entre 5 e 3.600 segundos.',
      );
      return;
    }

    setValidationMessage(null);
    setMutationError(null);
    setIsMutating(true);
    try {
      acceptState(await adminApi.openRound(token, electionId, parsedBody.data));
    } catch (error: unknown) {
      setMutationError(
        getRequestErrorMessage(error, 'Não foi possível abrir a rodada de votação.'),
      );
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
      setMutationError(
        getRequestErrorMessage(error, 'Não foi possível encerrar a rodada de votação.'),
      );
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
      'Não foi possível anular a rodada de votação.',
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
      'Não foi possível cancelar o cargo.',
    );
  }

  if (isLoading && state === null) {
    return <p role="status">Carregando o estado da eleição...</p>;
  }

  if (errorMessage !== null && state === null) {
    return <p role="alert">{errorMessage}</p>;
  }

  if (state === null) {
    return <p role="status">Aguardando o estado da eleição...</p>;
  }

  const nextPosition = state.election.positions.find(({ id }) => id === state.next.positionId);
  const currentRound = state.currentRound;

  return (
    <>
      <section aria-labelledby="live-election-heading">
        <h2 id="live-election-heading">Acompanhamento ao vivo</h2>
        {(errorMessage !== null || mutationError !== null) && (
          <p role="alert">{mutationError ?? errorMessage}</p>
        )}
        {state.next.status === 'READY' && (
          <>
            {nextPosition !== undefined && <p>Pronto para iniciar: {nextPosition.title}</p>}
            {state.election.status !== 'OPEN' ? (
              <p>Abra a eleição antes de iniciar uma rodada de votação.</p>
            ) : (
              <form noValidate onSubmit={handleOpenRound}>
                <label htmlFor="round-duration">Duração da rodada (segundos)</label>
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
                  {isMutating ? 'Abrindo rodada...' : 'Abrir rodada'}
                </button>
              </form>
            )}
          </>
        )}
        {state.next.status === 'ROUND_IN_PROGRESS' && currentRound !== undefined && (
          <>
            <p>Votação em andamento: {currentRound.positionTitle}</p>
            <p>
              Votos: {currentRound.votedCount} de {currentRound.eligibleCount}
            </p>
            <p>Prazo da votação: {currentRound.deadline}</p>
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
              {isMutating ? 'Encerrando rodada...' : 'Encerrar rodada antecipadamente'}
            </button>
          </>
        )}
        {state.next.status === 'ROUND_IN_PROGRESS' && currentRound === undefined && (
          <p role="alert">O servidor informa uma rodada ativa, mas não forneceu os dados dela.</p>
        )}
        {state.next.status === 'INSUFFICIENT_CANDIDATES' && (
          <InsufficientCandidatesPanel
            state={state}
            isMutating={isMutating}
            onAttach={(positionId, candidateId) =>
              void applyMutation(
                () => adminApi.attachCandidate({ token, electionId, positionId, candidateId }),
                'Não foi possível vincular a pessoa candidata ao cargo.',
              )
            }
            onDefer={(positionId) =>
              void applyMutation(
                () => adminApi.deferPosition({ token, electionId, positionId }),
                'Não foi possível adiar o cargo.',
              )
            }
            onCancel={(position) => setPositionToCancel(position)}
          />
        )}
        {state.next.status === 'AWAITING_RUNOFF' && <p>O próximo cargo aguarda o segundo turno.</p>}
        {state.next.status === 'NONE_LEFT' && <p>Não há mais cargos na fila.</p>}
        {state.lastResult !== undefined && (
          <RoundResultPanel
            state={state}
            result={state.lastResult}
            isMutating={isMutating}
            onOpenRunoff={(positionId) =>
              void applyMutation(
                () => adminApi.openRunoff({ token, electionId, positionId, body: {} }),
                'Não foi possível abrir o segundo turno.',
              )
            }
            onRelease={(roundId) =>
              void applyMutation(
                () => adminApi.releaseRound({ token, electionId, roundId }),
                'Não foi possível divulgar o resultado da rodada.',
              )
            }
            onAnnul={setRoundToAnnul}
            onUndo={() =>
              void applyMutation(
                () => adminApi.undoElection(token, electionId),
                'Não foi possível desfazer a última ação da eleição.',
              )
            }
          />
        )}
      </section>
      <ConfirmDialog
        open={roundToAnnul !== null}
        title="Anular rodada?"
        description={
          roundToAnnul === null
            ? ''
            : `Deseja anular a rodada encerrada de ${roundToAnnul.positionTitle}? O cargo retornará à fila.`
        }
        confirmLabel="Anular rodada"
        onConfirm={() => void annulSelectedRound()}
        onCancel={() => setRoundToAnnul(null)}
      />
      <ConfirmDialog
        open={positionToCancel !== null && !isCancelConfirmationOpen}
        title="Cancelar cargo?"
        description={
          positionToCancel === null
            ? ''
            : `Deseja cancelar ${positionToCancel.title}? O cargo será removido da eleição.`
        }
        confirmLabel="Continuar"
        onConfirm={() => setIsCancelConfirmationOpen(true)}
        onCancel={() => setPositionToCancel(null)}
      />
      <DoubleConfirmDialog
        open={isCancelConfirmationOpen && positionToCancel !== null}
        title="Confirmar cancelamento"
        description="Digite exatamente o nome do cargo para cancelá-lo."
        confirmationTitle={positionToCancel?.title ?? ''}
        confirmLabel="Cancelar cargo"
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
      <h3 id="last-round-result-heading">Resultado da última rodada</h3>
      <p>
        {outcomeMessage ??
          'O resultado do servidor não contém os dados necessários da candidatura.'}
      </p>
      {result.counts.length === 0 ? (
        <p>Nenhum voto em candidaturas foi registrado.</p>
      ) : (
        <ul aria-label="Votos por candidatura">
          {result.counts.map(({ candidateId, name, votes }) => (
            <li key={candidateId}>
              {name}: {votes} votos
            </li>
          ))}
        </ul>
      )}
      <p>
        Votos válidos: {result.validVotes}; votos em branco: {result.blank}.
      </p>
      {result.tiebreakApplied && <p>A regra de desempate do cargo determinou o resultado.</p>}
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
            Abrir segundo turno
          </button>
        ) : (
          <p role="alert">
            O resultado do servidor não contém os dados dos finalistas do segundo turno.
          </p>
        ))}
      {round === undefined ? (
        <p role="alert">O resultado do servidor não corresponde a nenhuma rodada desta eleição.</p>
      ) : (
        <>
          {round.resultsReleased ? (
            <p>Resultado divulgado aos eleitores.</p>
          ) : round.status === 'CLOSED' ? (
            <button type="button" disabled={isMutating} onClick={() => onRelease(round.id)}>
              Divulgar resultado aos eleitores
            </button>
          ) : null}
          {round.status === 'CLOSED' && (
            <button type="button" disabled={isMutating} onClick={() => onAnnul(result)}>
              Anular rodada
            </button>
          )}
        </>
      )}
      {state.canUndo && (
        <button type="button" disabled={isMutating} onClick={onUndo}>
          Desfazer última ação
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
      return electedCandidate === undefined ? null : `Pessoa eleita: ${electedCandidate.name}.`;
    }
    case 'RUNOFF_REQUIRED': {
      const finalists = result.runoffCandidateIds?.map(
        (candidateId) => result.counts.find(({ candidateId: id }) => id === candidateId)?.name,
      );
      return finalists?.every((name) => name !== undefined)
        ? `Segundo turno entre ${finalists[0]} e ${finalists[1]}.`
        : null;
    }
    case 'NO_VALID_VOTES':
      return 'Não houve votos válidos.';
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
    return (
      <p role="alert">O servidor não forneceu os dados do cargo com candidaturas insuficientes.</p>
    );
  }

  const attachableCandidates = state.next.attachableCandidates ?? [];

  return (
    <section aria-labelledby="insufficient-candidates-heading">
      <h3 id="insufficient-candidates-heading">
        Pessoas candidatas insuficientes para: {position.title}
      </h3>
      {attachableCandidates.length === 0 ? (
        <p>Não há pessoas candidatas aptas que possam ser vinculadas.</p>
      ) : (
        <ul aria-label="Pessoas candidatas que podem ser vinculadas">
          {attachableCandidates.map((candidate) => (
            <li key={candidate.id}>
              {candidate.name}
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onAttach(positionId, candidate.id)}
              >
                Vincular {candidate.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={isMutating} onClick={() => onDefer(positionId)}>
        Adiar {position.title}
      </button>
      <button
        type="button"
        disabled={isMutating}
        onClick={() => onCancel({ id: positionId, title: position.title })}
      >
        Cancelar {position.title}
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
    return getApiErrorMessage(error.error.code);
  }
  return fallback;
}
