import type { ReactElement } from 'react';
import { ErrorMessage } from '../../components/ErrorMessage';
import { VoterFinalState } from './VoterFinalState';
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
      <h1>Sessão de votação</h1>
      {isLoading && <p role="status">Carregando sua sessão...</p>}
      {error !== null && <ErrorMessage error={error} />}
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      {state?.phase === 'WAITING' && (
        <section>
          <h2>Aguardando o início da eleição</h2>
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
      {(state?.phase === 'VOTED' || state?.phase === 'RESULTS' || state?.phase === 'FINISHED') && (
        <VoterFinalState state={state} />
      )}
    </main>
  );
}
