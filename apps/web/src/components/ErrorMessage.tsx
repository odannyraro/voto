import type { ReactElement } from 'react';
import type { ErrorDTO } from '@voto/shared';

/** Propriedades para apresentar um erro retornado pela API. */
export interface ErrorMessageProps {
  readonly error: ErrorDTO;
}

/**
 * Apresenta código e mensagem de erro em uma região de alerta acessível.
 *
 * @param props - DTO de erro recebido da API.
 * @returns Mensagem de erro anunciada por leitores de tela.
 */
export function ErrorMessage({ error }: ErrorMessageProps): ReactElement {
  return (
    <div role="alert">
      <strong>{error.error.code}</strong>
      <p>{error.error.message}</p>
    </div>
  );
}
