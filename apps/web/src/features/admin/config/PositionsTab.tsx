import {
  createPositionBodySchema,
  type AdminElectionDTO,
  type CreatePositionBody,
  type Election,
  type TiebreakRule,
  type UpdatePositionBody,
} from '@voto/shared';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

/** Propriedades para administrar cargos usando o agregado atualizado pela API. */
export interface PositionsTabProps {
  readonly token: string;
  readonly electionId: string;
  readonly state: AdminElectionDTO;
  readonly onElectionChange: (state: AdminElectionDTO) => void;
}

/**
 * Cria, edita e remove cargos sem manter estado divergente do servidor.
 *
 * @param props - Credenciais, eleição atual e callback para o estado retornado pela API.
 * @returns Formulário e lista de cargos com confirmação de remoção.
 */
export function PositionsTab({
  token,
  electionId,
  state,
  onElectionChange,
}: PositionsTabProps): ReactElement {
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [positionToRemove, setPositionToRemove] = useState<Election['positions'][number] | null>(
    null,
  );
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const positions = getQueueOrderedPositions(state.election);

  /**
   * Cria um cargo e substitui a eleição pelo agregado devolvido pelo servidor.
   *
   * @param body - Título e desempate validados para o novo cargo.
   * @returns `true` quando a API confirma a criação; `false` quando ela falha.
   */
  async function createPosition(body: CreatePositionBody): Promise<boolean> {
    setErrorMessage(null);
    setIsMutating(true);
    try {
      const updatedElection = await adminApi.createPosition(token, electionId, body);
      onElectionChange(updatedElection);
      return true;
    } catch (error: unknown) {
      setErrorMessage(getRequestErrorMessage(error, 'Unable to create the position.'));
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Atualiza um cargo e adota o agregado completo retornado pela API.
   *
   * @param positionId - Identificador do cargo editado.
   * @param body - Título e desempate que devem ser atualizados.
   * @returns `true` quando a API confirma a alteração; `false` quando ela falha.
   */
  async function updatePosition(positionId: string, body: UpdatePositionBody): Promise<boolean> {
    setErrorMessage(null);
    setIsMutating(true);
    try {
      const updatedElection = await adminApi.updatePosition({
        token,
        electionId,
        positionId,
        body,
      });
      onElectionChange(updatedElection);
      setEditingPositionId(null);
      return true;
    } catch (error: unknown) {
      setErrorMessage(getRequestErrorMessage(error, 'Unable to update the position.'));
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Remove o cargo selecionado somente após confirmação e sucesso no servidor.
   *
   * @returns Promise resolvida após aplicar o estado atualizado ou exibir a falha.
   */
  async function removePosition(): Promise<void> {
    if (positionToRemove === null) {
      return;
    }

    const positionId = positionToRemove.id;
    setPositionToRemove(null);
    setErrorMessage(null);
    setIsMutating(true);
    try {
      const updatedElection = await adminApi.deletePosition({
        token,
        electionId,
        positionId,
      });
      onElectionChange(updatedElection);
    } catch (error: unknown) {
      setErrorMessage(getRequestErrorMessage(error, 'Unable to remove the position.'));
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Limpa uma falha antiga quando o administrador inicia outra edição.
   */
  function startEditing(positionId: string): void {
    setErrorMessage(null);
    setEditingPositionId(positionId);
  }

  return (
    <section aria-labelledby="positions-heading">
      <h2 id="positions-heading">Positions</h2>
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      {positions.length === 0 ? (
        <p>No positions have been added.</p>
      ) : (
        <ul aria-label="Election positions">
          {positions.map((position) => (
            <li key={position.id}>
              {editingPositionId === position.id ? (
                <PositionForm
                  initialTitle={position.title}
                  initialTiebreak={position.tiebreak}
                  submitLabel="Save position"
                  disabled={isMutating}
                  onSubmit={(body) => updatePosition(position.id, body)}
                  onCancel={() => setEditingPositionId(null)}
                />
              ) : (
                <>
                  <h3>{position.title}</h3>
                  <p>Tie-break rule: {getTiebreakLabel(position.tiebreak)}</p>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => startEditing(position.id)}
                  >
                    Edit {position.title}
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => {
                      setErrorMessage(null);
                      setPositionToRemove(position);
                    }}
                  >
                    Remove {position.title}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editingPositionId === null && (
        <PositionForm
          initialTitle=""
          initialTiebreak="YOUNGEST"
          submitLabel="Add position"
          disabled={isMutating}
          onSubmit={createPosition}
        />
      )}
      <ConfirmDialog
        open={positionToRemove !== null}
        title="Remove position?"
        description={
          positionToRemove === null
            ? ''
            : `Remove ${positionToRemove.title} from this election? The server will validate whether removal is allowed.`
        }
        confirmLabel="Remove position"
        onConfirm={() => void removePosition()}
        onCancel={() => setPositionToRemove(null)}
      />
    </section>
  );
}

/**
 * Valida e envia o título e a regra de desempate de um cargo.
 *
 * @param props - Valores iniciais, rótulo, estado de envio e ações de sucesso/cancelamento.
 * @returns Formulário acessível para criar ou editar um cargo.
 */
function PositionForm({
  initialTitle,
  initialTiebreak,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  readonly initialTitle: string;
  readonly initialTiebreak: TiebreakRule;
  readonly submitLabel: string;
  readonly disabled: boolean;
  readonly onSubmit: (body: CreatePositionBody) => Promise<boolean>;
  readonly onCancel?: () => void;
}): ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [tiebreak, setTiebreak] = useState<TiebreakRule>(initialTiebreak);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  /**
   * Valida os campos e delega a gravação ao fluxo REST do painel.
   *
   * @param event - Envio do formulário de cargo.
   * @returns Promise resolvida após validar e enviar os campos.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedBody = createPositionBodySchema.safeParse({ title, tiebreak });
    if (!parsedBody.success) {
      setValidationMessage(
        title.trim() === '' ? 'Position title is required.' : 'Enter a valid position title.',
      );
      return;
    }

    setValidationMessage(null);
    const wasSaved = await onSubmit(parsedBody.data);
    if (wasSaved && onCancel === undefined) {
      setTitle('');
      setTiebreak('YOUNGEST');
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <h3>{submitLabel === 'Add position' ? 'Add a position' : 'Edit position'}</h3>
      <label htmlFor="position-title">Position title</label>
      <input
        id="position-title"
        type="text"
        required
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      <label htmlFor="position-tiebreak">Tie-break rule</label>
      <select
        id="position-tiebreak"
        value={tiebreak}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (isTiebreakRule(value)) {
            setTiebreak(value);
          }
        }}
      >
        <option value="YOUNGEST">Youngest candidate</option>
        <option value="OLDEST">Oldest candidate</option>
        <option value="MOST_REMAINING_TIME">Most remaining university time</option>
      </select>
      {validationMessage !== null && <p role="alert">{validationMessage}</p>}
      <button type="submit" disabled={disabled}>
        {submitLabel}
      </button>
      {onCancel !== undefined && (
        <button type="button" disabled={disabled} onClick={onCancel}>
          Cancel editing
        </button>
      )}
    </form>
  );
}

/**
 * Ordena os cargos conforme a fila autoritativa recebida na eleição.
 *
 * @param election - Agregado completo devolvido pela API.
 * @returns Cargos na fila atual, seguidos de cargos fora dela.
 */
function getQueueOrderedPositions(election: Election): Election['positions'][number][] {
  const positionsById = new Map(election.positions.map((position) => [position.id, position]));
  const queuedPositions = election.queue.flatMap((positionId) => {
    const position = positionsById.get(positionId);
    return position === undefined ? [] : [position];
  });
  const queuedIds = new Set(election.queue);
  return [...queuedPositions, ...election.positions.filter(({ id }) => !queuedIds.has(id))];
}

/**
 * Converte a regra de desempate em um rótulo compreensível para o administrador.
 *
 * @param tiebreak - Estratégia armazenada no cargo.
 * @returns Rótulo correspondente à regra.
 */
function getTiebreakLabel(tiebreak: TiebreakRule): string {
  switch (tiebreak) {
    case 'YOUNGEST':
      return 'Youngest candidate';
    case 'OLDEST':
      return 'Oldest candidate';
    case 'MOST_REMAINING_TIME':
      return 'Most remaining university time';
  }
}

/**
 * Verifica se o valor de um controle pertence às regras de desempate do domínio.
 *
 * @param value - Valor recebido do elemento select.
 * @returns `true` para uma regra compartilhada reconhecida.
 */
function isTiebreakRule(value: string): value is TiebreakRule {
  return value === 'YOUNGEST' || value === 'OLDEST' || value === 'MOST_REMAINING_TIME';
}

/**
 * Extrai a mensagem concreta da API ou uma mensagem explícita para falhas de transporte.
 *
 * @param error - Falha recebida na chamada REST.
 * @param fallback - Mensagem para uma falha sem payload de API.
 * @returns Código e mensagem da API ou a mensagem alternativa.
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
