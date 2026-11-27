import {
  createCandidateBodySchema,
  type AdminElectionDTO,
  type Candidate,
  type CreateCandidateBody,
  type Election,
  type UpdateCandidateBody,
} from '@voto/shared';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../../lib/ui-messages';

/** Propriedades para administrar candidatos usando o estado devolvido pela API. */
export interface CandidatesTabProps {
  readonly token: string;
  readonly electionId: string;
  readonly state: AdminElectionDTO;
  readonly onElectionChange: (state: AdminElectionDTO) => void;
}

/**
 * Cria, edita e remove candidatos e suas candidaturas na eleição.
 *
 * @param props - Credenciais, agregado atual e callback do novo estado da eleição.
 * @returns Formulários, candidaturas e confirmação de remoção.
 */
export function CandidatesTab({
  token,
  electionId,
  state,
  onElectionChange,
}: CandidatesTabProps): ReactElement {
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [candidateToRemove, setCandidateToRemove] = useState<Candidate | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Cria candidato e substitui a eleição pelo agregado devolvido pelo servidor.
   *
   * @param body - Dados de candidato validados pelo schema compartilhado.
   * @returns `true` após sucesso; `false` quando a API rejeita a criação.
   */
  async function createCandidate(body: CreateCandidateBody): Promise<boolean> {
    setErrorMessage(null);
    setIsMutating(true);
    try {
      const updatedState = await adminApi.createCandidate(token, electionId, body);
      onElectionChange(updatedState);
      return true;
    } catch (error: unknown) {
      setErrorMessage(
        getRequestErrorMessage(error, 'Não foi possível cadastrar a pessoa candidata.'),
      );
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Atualiza os dados e candidaturas pelo agregado completo da API.
   *
   * @param candidateId - Identificador do candidato em edição.
   * @param body - Campos atualizados do candidato.
   * @returns `true` após sucesso; `false` quando a API rejeita a alteração.
   */
  async function updateCandidate(candidateId: string, body: UpdateCandidateBody): Promise<boolean> {
    setErrorMessage(null);
    setIsMutating(true);
    try {
      const updatedState = await adminApi.updateCandidate({
        token,
        electionId,
        candidateId,
        body,
      });
      onElectionChange(updatedState);
      setEditingCandidateId(null);
      return true;
    } catch (error: unknown) {
      setErrorMessage(
        getRequestErrorMessage(error, 'Não foi possível atualizar a pessoa candidata.'),
      );
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Remove o candidato após confirmação, sem assumir sucesso antes da resposta da API.
   *
   * @returns Promise resolvida após aplicar o estado do servidor ou mostrar a rejeição.
   */
  async function removeCandidate(): Promise<void> {
    if (candidateToRemove === null) {
      return;
    }

    const candidateId = candidateToRemove.id;
    setCandidateToRemove(null);
    setErrorMessage(null);
    setIsMutating(true);
    try {
      const updatedState = await adminApi.deleteCandidate({
        token,
        electionId,
        candidateId,
      });
      onElectionChange(updatedState);
    } catch (error: unknown) {
      setErrorMessage(
        getRequestErrorMessage(error, 'Não foi possível remover a pessoa candidata.'),
      );
    } finally {
      setIsMutating(false);
    }
  }

  /**
   * Inicia edição sem carregar mensagens de uma mutação anterior.
   *
   * @param candidateId - Identificador do candidato escolhido para editar.
   */
  function startEditing(candidateId: string): void {
    setErrorMessage(null);
    setEditingCandidateId(candidateId);
  }

  return (
    <section aria-labelledby="candidates-heading">
      <h2 id="candidates-heading">Candidaturas</h2>
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      {state.election.candidates.length === 0 ? (
        <p>Nenhuma pessoa candidata foi cadastrada.</p>
      ) : (
        <ul aria-label="Pessoas candidatas da eleição">
          {state.election.candidates.map((candidate) => (
            <li key={candidate.id}>
              {editingCandidateId === candidate.id ? (
                <CandidateForm
                  positions={state.election.positions}
                  initialCandidate={candidate}
                  submitLabel="Salvar candidatura"
                  disabled={isMutating}
                  onSubmit={(body) => updateCandidate(candidate.id, body)}
                  onCancel={() => setEditingCandidateId(null)}
                />
              ) : (
                <>
                  <h3>{candidate.name}</h3>
                  <p>Idade: {candidate.age} anos</p>
                  <p>Tempo restante na universidade: {candidate.remainingMonths} meses</p>
                  <p>
                    Cargos pretendidos:{' '}
                    {candidate.applications
                      .map((positionId) => getPositionTitle(state.election, positionId))
                      .join(', ')}
                  </p>
                  <p>
                    Primeira opção:{' '}
                    {getPositionTitle(state.election, candidate.firstChoicePositionId)}
                  </p>
                  {isElectedCandidate(state.election, candidate.id) && <p>Pessoa já eleita</p>}
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => startEditing(candidate.id)}
                  >
                    Editar {candidate.name}
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => {
                      setErrorMessage(null);
                      setCandidateToRemove(candidate);
                    }}
                  >
                    Remover {candidate.name}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editingCandidateId === null && (
        <CandidateForm
          positions={state.election.positions}
          submitLabel="Adicionar candidatura"
          disabled={isMutating}
          onSubmit={createCandidate}
        />
      )}
      <ConfirmDialog
        open={candidateToRemove !== null}
        title="Remover pessoa candidata?"
        description={
          candidateToRemove === null
            ? ''
            : `Deseja remover ${candidateToRemove.name} desta eleição? A administração da eleição validará se a remoção é permitida.`
        }
        confirmLabel="Remover pessoa candidata"
        onConfirm={() => void removeCandidate()}
        onCancel={() => setCandidateToRemove(null)}
      />
    </section>
  );
}

/**
 * Valida e envia identidade, dados acadêmicos, candidaturas e primeira opção.
 *
 * @param props - Candidato inicial opcional, cargos disponíveis e ações do formulário.
 * @returns Formulário de cadastro ou edição acessível.
 */
function CandidateForm({
  positions,
  initialCandidate,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  readonly positions: Election['positions'];
  readonly initialCandidate?: Candidate;
  readonly submitLabel: string;
  readonly disabled: boolean;
  readonly onSubmit: (body: CreateCandidateBody) => Promise<boolean>;
  readonly onCancel?: () => void;
}): ReactElement {
  const [name, setName] = useState(initialCandidate?.name ?? '');
  const [age, setAge] = useState(initialCandidate?.age.toString() ?? '');
  const [remainingMonths, setRemainingMonths] = useState(
    initialCandidate?.remainingMonths.toString() ?? '0',
  );
  const [applications, setApplications] = useState<readonly string[]>(
    initialCandidate?.applications ?? [],
  );
  const [firstChoicePositionId, setFirstChoicePositionId] = useState(
    initialCandidate?.firstChoicePositionId ?? '',
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const availableApplications = positions.filter(({ id }) => applications.includes(id));

  /**
   * Mantém a primeira opção entre as candidaturas sempre que a seleção muda.
   *
   * @param positionId - Cargo marcado ou desmarcado como candidatura.
   */
  function toggleApplication(positionId: string): void {
    const nextApplications = applications.includes(positionId)
      ? applications.filter((id) => id !== positionId)
      : [...applications, positionId];
    setApplications(nextApplications);
    if (!nextApplications.includes(firstChoicePositionId)) {
      setFirstChoicePositionId(nextApplications[0] ?? '');
    }
  }

  /**
   * Valida os campos e delega criação ou edição para a API administrativa.
   *
   * @param event - Envio do formulário de candidato.
   * @returns Promise resolvida após validação e envio.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = {
      name,
      age: Number(age),
      remainingMonths: Number(remainingMonths),
      applications: [...applications],
      firstChoicePositionId,
    };
    const parsedBody = createCandidateBodySchema.safeParse(body);
    if (!parsedBody.success) {
      setValidationMessage(getCandidateValidationMessage(body));
      return;
    }

    setValidationMessage(null);
    const wasSaved = await onSubmit(parsedBody.data);
    if (wasSaved && onCancel === undefined) {
      setName('');
      setAge('');
      setRemainingMonths('0');
      setApplications([]);
      setFirstChoicePositionId('');
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <h3>
        {submitLabel === 'Adicionar candidatura'
          ? 'Cadastrar pessoa candidata'
          : 'Editar candidatura'}
      </h3>
      <label htmlFor="candidate-name">Nome</label>
      <input
        id="candidate-name"
        type="text"
        required
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <label htmlFor="candidate-age">Idade (anos)</label>
      <input
        id="candidate-age"
        type="number"
        min={16}
        max={120}
        step={1}
        required
        value={age}
        onChange={(event) => setAge(event.currentTarget.value)}
      />
      <label htmlFor="candidate-remaining-months">Tempo restante na universidade (meses)</label>
      <input
        id="candidate-remaining-months"
        type="number"
        min={0}
        step={1}
        required
        value={remainingMonths}
        onChange={(event) => setRemainingMonths(event.currentTarget.value)}
      />
      <fieldset>
        <legend>Cargos pretendidos</legend>
        {positions.map((position) => (
          <label key={position.id}>
            <input
              type="checkbox"
              checked={applications.includes(position.id)}
              onChange={() => toggleApplication(position.id)}
            />
            {position.title}
          </label>
        ))}
      </fieldset>
      <label htmlFor="candidate-first-choice">Primeira opção de cargo</label>
      <select
        id="candidate-first-choice"
        value={firstChoicePositionId}
        disabled={availableApplications.length === 0}
        onChange={(event) => setFirstChoicePositionId(event.currentTarget.value)}
      >
        <option value="">Selecione um cargo pretendido</option>
        {availableApplications.map((position) => (
          <option key={position.id} value={position.id}>
            {position.title}
          </option>
        ))}
      </select>
      {validationMessage !== null && <p role="alert">{validationMessage}</p>}
      <button type="submit" disabled={disabled}>
        {submitLabel}
      </button>
      {onCancel !== undefined && (
        <button type="button" disabled={disabled} onClick={onCancel}>
          Cancelar edição
        </button>
      )}
    </form>
  );
}

/**
 * Traduz falhas de schema em mensagens acionáveis para o administrador.
 *
 * @param body - Valores submetidos antes da validação.
 * @returns Mensagem que identifica o primeiro campo inválido.
 */
function getCandidateValidationMessage(body: {
  readonly name: string;
  readonly age: number;
  readonly remainingMonths: number;
  readonly applications: readonly string[];
  readonly firstChoicePositionId: string;
}): string {
  if (body.name.trim() === '') {
    return 'Informe o nome da pessoa candidata.';
  }
  if (!Number.isInteger(body.age) || body.age < 16 || body.age > 120) {
    return 'A idade deve ser um número inteiro entre 16 e 120 anos.';
  }
  if (!Number.isInteger(body.remainingMonths) || body.remainingMonths < 0) {
    return 'O tempo restante na universidade deve ser um número inteiro não negativo de meses.';
  }
  if (body.applications.length === 0) {
    return 'Selecione ao menos um cargo pretendido.';
  }
  return 'A primeira opção deve ser um dos cargos pretendidos.';
}

/**
 * Resolve título de cargo para exibir candidaturas e primeira opção.
 *
 * @param election - Agregado com os cargos disponíveis.
 * @param positionId - Identificador referenciado pelo candidato.
 * @returns Título do cargo ou identificador caso não exista no estado atual.
 */
function getPositionTitle(election: Election, positionId: string): string {
  return election.positions.find(({ id }) => id === positionId)?.title ?? positionId;
}

/**
 * Verifica se o candidato foi eleito para algum cargo do agregado.
 *
 * @param election - Agregado completo devolvido pela API.
 * @param candidateId - Candidato cujo estado é consultado.
 * @returns `true` se algum cargo o identifica como eleito.
 */
function isElectedCandidate(election: Election, candidateId: string): boolean {
  return election.positions.some(({ electedCandidateId }) => electedCandidateId === candidateId);
}

/**
 * Expõe o erro do servidor ou da rede sem mascarar falhas de remoção/edição.
 *
 * @param error - Falha recebida da chamada REST.
 * @param fallback - Mensagem para uma falha sem payload de API.
 * @returns Código/mensagem do servidor ou mensagem alternativa explícita.
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
