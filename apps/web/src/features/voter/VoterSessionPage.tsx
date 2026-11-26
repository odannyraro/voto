import type { ReactElement } from 'react';
import { ErrorMessage } from '../../components/ErrorMessage';
import { VoterVotePage } from './VoterVotePage';
import { useVoterSession } from './useVoterSession';

/** Propriedades para apresentar uma sessão do eleitor autenticada. */
export interface VoterSessionPageProps {
  /** Token emitido ao eleitor quando o código de acesso foi aceito. */
  readonly token: string | null;
}

/**
 * Apresenta a fase atual da eleição para o eleitor e informa falhas de sincronização.
 *
 * @param props - Credencial da sessão usada para consultar o estado do eleitor.
 * @returns Área de sessão que será preenchida pelo fluxo realtime.
 */
export function VoterSessionPage({ token }: VoterSessionPageProps): ReactElement {
  const { state, clientNowAtSync, isLoading, error, errorMessage } = useVoterSession(token);

  return (
    <main>
      <h1>Voter session</h1>
      {isLoading && <p role="status">Loading voter session...</p>}
      {error !== null && <ErrorMessage error={error} />}
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      {state?.phase === 'WAITING' && (
        <section>
          <h2>Waiting for election to start</h2>
          <p>{state.electionName}</p>
        </section>
      )}
      {state?.phase === 'VOTING' && token !== null && clientNowAtSync !== null && (
        <VoterVotePage
          key={state.round.roundId}
          token={token}
          round={state.round}
          serverNow={state.serverNow}
          clientNowAtSync={clientNowAtSync}
        />
      )}
      {state !== null && state.phase !== 'WAITING' && state.phase !== 'VOTING' && (
        <p role="status">Current phase: {state.phase}</p>
      )}
    </main>
  );
}
