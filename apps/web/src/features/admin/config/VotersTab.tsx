import { credentialVotersBodySchema, type AdminElectionDTO, type Voter } from '@voto/shared';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { getApiErrorMessage } from '../../../lib/ui-messages';

/** Propriedades para gerar e administrar credenciais de eleitores. */
export interface VotersTabProps {
  readonly token: string;
  readonly electionId: string;
  readonly state: AdminElectionDTO;
  readonly onElectionChange: (state: AdminElectionDTO) => void;
}

/**
 * Gera códigos, mostra credenciais, permite copiá-las e revogar eleitores.
 *
 * @param props - Credenciais, agregado atual e callback do estado atualizado.
 * @returns Formulário de geração e tabela de códigos de eleitores.
 */
export function VotersTab({
  token,
  electionId,
  state,
  onElectionChange,
}: VotersTabProps): ReactElement {
  const [count, setCount] = useState('1');
  const [labelsText, setLabelsText] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voterToRevoke, setVoterToRevoke] = useState<Voter | null>(null);

  /**
   * Gera códigos depois de validar quantidade e rótulos.
   *
   * @param event - Envio do formulário de credenciamento.
   * @returns Promise resolvida após validar ou concluir a chamada REST.
   */
  async function handleGenerate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);
    const labels = labelsText
      .split('\n')
      .map((label) => label.trim())
      .filter((label) => label !== '');
    const parsedBody = credentialVotersBodySchema.safeParse({
      count: Number(count),
      ...(labels.length > 0 ? { labels } : {}),
    });

    if (!parsedBody.success) {
      setValidationMessage(getCredentialValidationMessage(Number(count), labels.length));
      return;
    }

    if (labels.length > parsedBody.data.count) {
      setValidationMessage('Informe no máximo um rótulo por eleitor.');
      return;
    }

    setValidationMessage(null);
    setIsSubmitting(true);
    try {
      const result = await adminApi.credentialVoters(token, electionId, parsedBody.data);
      onElectionChange(result.election);
      setLabelsText('');
      setFeedbackMessage(`${result.codes.length} códigos de acesso gerados.`);
    } catch (error: unknown) {
      setErrorMessage(
        getRequestErrorMessage(error, 'Não foi possível gerar os códigos de acesso.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Copia um código ou o conjunto visível e informa o resultado da operação.
   *
   * @param text - Código ou códigos já exibidos na tela.
   * @param successMessage - Mensagem anunciada após a cópia.
   * @returns Promise resolvida após reportar sucesso ou falha da área de transferência.
   */
  async function copyCodes(text: string, successMessage: string): Promise<void> {
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      await navigator.clipboard.writeText(text);
      setFeedbackMessage(successMessage);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? 'Não foi possível copiar os códigos de acesso. Confira a permissão da área de transferência e tente novamente.'
          : 'Não foi possível copiar os códigos de acesso. Tente novamente.',
      );
    }
  }

  /**
   * Revoga a credencial selecionada após confirmação.
   *
   * @returns Promise resolvida após adotar o agregado atualizado ou exibir falha.
   */
  async function revokeVoter(): Promise<void> {
    if (voterToRevoke === null) {
      return;
    }

    const voterId = voterToRevoke.id;
    setVoterToRevoke(null);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setIsSubmitting(true);
    try {
      const updatedState = await adminApi.revokeVoter({ token, electionId, voterId });
      onElectionChange(updatedState);
      setFeedbackMessage('Código de acesso revogado.');
    } catch (error: unknown) {
      setErrorMessage(
        getRequestErrorMessage(error, 'Não foi possível revogar este código de acesso.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const voterCodes = state.election.voters.map(({ code }) => code).join('\n');

  return (
    <section aria-labelledby="voters-heading">
      <h2 id="voters-heading">Eleitores</h2>
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      {feedbackMessage !== null && <p role="status">{feedbackMessage}</p>}
      <form noValidate onSubmit={handleGenerate}>
        <label htmlFor="voter-count">Quantidade de eleitores</label>
        <input
          id="voter-count"
          type="number"
          min={1}
          max={500}
          step={1}
          required
          value={count}
          onChange={(event) => setCount(event.currentTarget.value)}
        />
        <label htmlFor="voter-labels">Rótulos opcionais, um por linha</label>
        <textarea
          id="voter-labels"
          value={labelsText}
          onChange={(event) => setLabelsText(event.currentTarget.value)}
        />
        {validationMessage !== null && <p role="alert">{validationMessage}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Gerando...' : 'Gerar códigos'}
        </button>
      </form>
      {state.election.voters.length === 0 ? (
        <p>Nenhum código de acesso foi gerado.</p>
      ) : (
        <>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void copyCodes(voterCodes, 'Códigos de acesso copiados.')}
          >
            Copiar todos os códigos
          </button>
          <table aria-label="Códigos de acesso dos eleitores">
            <thead>
              <tr>
                <th scope="col">Rótulo</th>
                <th scope="col">Código</th>
                <th scope="col">Situação</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {state.election.voters.map((voter) => (
                <tr key={voter.id}>
                  <td>{voter.label ?? 'Sem rótulo'}</td>
                  <td>{voter.code}</td>
                  <td>{voter.status === 'CREDENTIALED' ? 'Ativo' : 'Revogado'}</td>
                  <td>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void copyCodes(voter.code, 'Código copiado.')}
                    >
                      Copiar código de {voter.label ?? voter.id}
                    </button>
                    {voter.status === 'CREDENTIALED' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setVoterToRevoke(voter)}
                      >
                        Revogar acesso de {voter.label ?? voter.id}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <ConfirmDialog
        open={voterToRevoke !== null}
        title="Revogar código de acesso?"
        description={
          voterToRevoke === null
            ? ''
            : `Deseja revogar o código de ${voterToRevoke.label ?? voterToRevoke.id}?`
        }
        confirmLabel="Revogar código"
        onConfirm={() => void revokeVoter()}
        onCancel={() => setVoterToRevoke(null)}
      />
    </section>
  );
}

/**
 * Seleciona uma mensagem objetiva para quantidade ou rótulos inválidos.
 *
 * @param count - Valor numérico informado no formulário.
 * @param labelCount - Quantidade de rótulos não vazios.
 * @returns Mensagem de validação específica.
 */
function getCredentialValidationMessage(count: number, labelCount: number): string {
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return 'A quantidade deve ser um número inteiro entre 1 e 500.';
  }
  if (labelCount > count) {
    return 'Informe no máximo um rótulo por eleitor.';
  }
  return 'Os rótulos dos eleitores não podem estar vazios.';
}

/**
 * Preserva a mensagem REST e deixa explícitas falhas sem payload de domínio.
 *
 * @param error - Falha recebida pela chamada administrativa.
 * @param fallback - Mensagem para uma falha sem payload de API.
 * @returns Código/mensagem da API ou mensagem alternativa explícita.
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
