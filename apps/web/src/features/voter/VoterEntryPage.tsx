import { voterSessionBodySchema, type ErrorDTO } from '@voto/shared';
import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { ApiError } from '../../api/api-client';
import { voterApi } from '../../api/voter-api';
import { ErrorMessage } from '../../components/ErrorMessage';

/**
 * Permite que um eleitor inicie uma sessão usando seu código de acesso.
 *
 * @returns Formulário acessível para entrar em uma eleição.
 */
export function VoterEntryPage(): ReactElement {
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
      setValidationMessage('Enter a valid eight-character voter code.');
      return;
    }

    setIsSubmitting(true);
    try {
      await voterApi.createSession(parsedBody.data);
      setRequestMessage('Session created.');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.error !== undefined) {
        setRequestError({ error: error.error });
      } else {
        setRequestMessage('Unable to start your session. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Join an election</h1>
      <p>Enter the eight-character voter code provided to you.</p>
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="voter-code">Voter code</label>
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
          {isSubmitting ? 'Joining...' : 'Enter'}
        </button>
      </form>
    </main>
  );
}
