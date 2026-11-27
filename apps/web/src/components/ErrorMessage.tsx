import type { ReactElement } from 'react';
import type { ErrorDTO } from '@voto/shared';
import { getApiErrorMessage } from '../lib/ui-messages';

/** Propriedades para apresentar um erro retornado pela API. */
export interface ErrorMessageProps {
  readonly error: ErrorDTO;
}

/**
 * Apresenta uma orientação em português para o erro devolvido pela API.
 *
 * @param props - DTO de erro recebido da API.
 * @returns Mensagem de erro em uma região de alerta acessível.
 */
export function ErrorMessage({ error }: ErrorMessageProps): ReactElement {
  return (
    <div role="alert">
      <p>{getApiErrorMessage(error.error.code)}</p>
    </div>
  );
}
