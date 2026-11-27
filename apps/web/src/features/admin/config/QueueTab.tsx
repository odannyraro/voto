import { queueBodySchema, type AdminElectionDTO } from '@voto/shared';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../../lib/ui-messages';

/** Propriedades para propor e confirmar a ordem de votação dos cargos. */
export interface QueueTabProps {
  readonly token: string;
  readonly electionId: string;
  readonly state: AdminElectionDTO;
  readonly onElectionChange: (state: AdminElectionDTO) => void;
}

/**
 * Propõe uma ordem de cargos, permite ajustá-la e aplica somente após confirmação.
 *
 * @param props - Credenciais, agregado atual e callback do agregado atualizado.
 * @returns Controles acessíveis para reorganizar a fila e confirmar sua aplicação.
 */
export function QueueTab({
  token,
  electionId,
  state,
  onElectionChange,
}: QueueTabProps): ReactElement {
  const [proposedOrder, setProposedOrder] = useState<readonly string[]>(state.election.queue);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProposedOrder(state.election.queue);
  }, [state.election.queue]);

  const positionsById = new Map(
    state.election.positions.map((position) => [position.id, position]),
  );
  const proposedPositions = proposedOrder.flatMap((positionId) => {
    const position = positionsById.get(positionId);
    return position === undefined ? [] : [position];
  });
  const hasChanges =
    proposedOrder.length !== state.election.queue.length ||
    proposedOrder.some((positionId, index) => positionId !== state.election.queue[index]);

  /**
   * Move um cargo uma posição na ordem proposta sem alterar o agregado do servidor.
   *
   * @param index - Índice do cargo que será movido.
   * @param offset - Deslocamento de uma posição para cima ou para baixo.
   */
  function movePosition(index: number, offset: -1 | 1): void {
    const destination = index + offset;
    if (destination < 0 || destination >= proposedOrder.length) {
      return;
    }

    const movingPosition = proposedOrder[index];
    const displacedPosition = proposedOrder[destination];
    if (movingPosition === undefined || displacedPosition === undefined) {
      return;
    }

    const updatedOrder = [...proposedOrder];
    updatedOrder[index] = displacedPosition;
    updatedOrder[destination] = movingPosition;
    setProposedOrder(updatedOrder);
    setErrorMessage(null);
  }

  /**
   * Busca a sugestão de ordem sem aplicá-la à fila persistida.
   *
   * @returns Promise resolvida após atualizar somente a proposta ou mostrar erro.
   */
  async function loadSuggestion(): Promise<void> {
    setErrorMessage(null);
    setIsLoadingSuggestion(true);
    try {
      const suggestion = await adminApi.getQueueSuggestion(token, electionId);
      setProposedOrder(suggestion.positionIds);
    } catch (error: unknown) {
      setErrorMessage(getRequestErrorMessage(error, 'Não foi possível sugerir uma ordem.'));
    } finally {
      setIsLoadingSuggestion(false);
    }
  }

  /**
   * Aplica a proposta após confirmação e adota o agregado devolvido pelo servidor.
   *
   * @returns Promise resolvida após a atualização ou apresentação de erro.
   */
  async function applyProposedOrder(): Promise<void> {
    setIsConfirmationOpen(false);
    const parsedBody = queueBodySchema.safeParse({ positionIds: proposedOrder });
    if (!parsedBody.success) {
      setErrorMessage('A ordem sugerida é inválida. Atualize a eleição e tente novamente.');
      return;
    }

    setErrorMessage(null);
    setIsApplying(true);
    try {
      const updatedState = await adminApi.updateQueue(token, electionId, parsedBody.data);
      onElectionChange(updatedState);
      setProposedOrder(updatedState.election.queue);
    } catch (error: unknown) {
      setErrorMessage(getRequestErrorMessage(error, 'Não foi possível aplicar a ordem sugerida.'));
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section aria-labelledby="queue-heading">
      <h2 id="queue-heading">Ordem de votação</h2>
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      <button
        type="button"
        disabled={isLoadingSuggestion || isApplying}
        onClick={() => void loadSuggestion()}
      >
        {isLoadingSuggestion ? 'Buscando sugestão...' : 'Sugerir ordem'}
      </button>
      {proposedPositions.length === 0 ? (
        <p>Não há cargos pendentes na fila de votação.</p>
      ) : (
        <ol aria-label="Ordem de votação sugerida">
          {proposedPositions.map((position, index) => (
            <li key={position.id}>
              <span>{position.title}</span>
              <button
                type="button"
                aria-label={`Mover ${position.title} para cima`}
                disabled={index === 0 || isApplying}
                onClick={() => movePosition(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Mover ${position.title} para baixo`}
                disabled={index === proposedPositions.length - 1 || isApplying}
                onClick={() => movePosition(index, 1)}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      )}
      <p>
        {hasChanges
          ? 'A ordem sugerida ainda não foi aplicada.'
          : 'A ordem sugerida corresponde à fila atual.'}
      </p>
      <button
        type="button"
        disabled={!hasChanges || isApplying || isLoadingSuggestion}
        onClick={() => setIsConfirmationOpen(true)}
      >
        Aplicar ordem
      </button>
      <ConfirmDialog
        open={isConfirmationOpen}
        title="Aplicar ordem de votação?"
        description="A fila atual será substituída pela ordem sugerida."
        confirmLabel="Aplicar ordem"
        onConfirm={() => void applyProposedOrder()}
        onCancel={() => setIsConfirmationOpen(false)}
      />
    </section>
  );
}

/**
 * Expõe o erro de API da fila ou uma mensagem de falha de transporte.
 *
 * @param error - Falha recebida na consulta ou alteração da fila.
 * @param fallback - Mensagem para falhas sem payload de API.
 * @returns Mensagem do erro observado.
 */
function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.error !== undefined) {
    return getApiErrorMessage(error.error.code);
  }
  if (error instanceof Error) {
    return fallback;
  }
  return fallback;
}
