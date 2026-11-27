import { voterSessionBodySchema, type ErrorDTO } from '@voto/shared';
import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { ApiError } from '../../api/api-client';
import { voterApi } from '../../api/voter-api';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useNavigate } from 'react-router';
import { saveVoterSession } from './voter-session-storage';

/**
 * Permite que um eleitor inicie uma sessão usando seu código de acesso.
 *
 * @returns Formulário acessível para entrar em uma eleição.
 */
export function VoterEntryPage(): ReactElement {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [validationMessage, setValidationMessage] = useState<string>();
  const [requestError, setRequestError] = useState<ErrorDTO>();
  const [requestMessage, setRequestMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Mantém o código digitado e remove mensagens que já não se aplicam.
   *
   * @param event - Evento de alteração do campo do código.
   * @returns Atualiza o valor do campo e limpa mensagens anteriores.
   */
  function handleCodeChange(event: ChangeEvent<HTMLInputElement>): void {
    setCode(event.currentTarget.value);
    setValidationMessage(undefined);
    setRequestError(undefined);
    setRequestMessage(undefined);
  }

  /**
   * Valida o código localmente e solicita uma sessão ao servidor.
   *
   * @param event - Envio do formulário de entrada.
   * @returns Resolve após atualizar o estado de envio e o resultado da solicitação.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(undefined);
    setRequestError(undefined);
    setRequestMessage(undefined);

    const parsedBody = voterSessionBodySchema.safeParse({ code });
    if (!parsedBody.success) {
      setValidationMessage('Informe um código válido com oito caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await voterApi.createSession(parsedBody.data);
      saveVoterSession({ token: session.token, electionId: session.electionId });
      navigate('/votar', { replace: true });
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        if (error.error !== undefined) {
          setRequestError({ error: error.error });
        } else {
          setRequestMessage('Não foi possível iniciar sua sessão. Tente novamente.');
        }
      } else {
        setRequestMessage('Não foi possível iniciar sua sessão. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Vote na sua eleição</h1>
      <p>Digite o código de oito caracteres que você recebeu para participar.</p>
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="voter-code">Código de acesso</label>
        <input
          id="voter-code"
          type="text"
          autoComplete="one-time-code"
          required
          value={code}
          aria-invalid={validationMessage !== undefined}
          aria-describedby={validationMessage === undefined ? undefined : 'voter-code-error'}
          onChange={handleCodeChange}
        />
        {validationMessage !== undefined && (
          <p id="voter-code-error" role="alert">
            {validationMessage}
          </p>
        )}
        {requestError !== undefined && <ErrorMessage error={requestError} />}
        {requestMessage !== undefined && <p role="status">{requestMessage}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar para votar'}
        </button>
      </form>
    </main>
  );
}
