import type { ReactElement } from 'react';

/**
 * Confirma que a sessão do eleitor foi iniciada antes de carregar seu estado.
 *
 * @returns Área de sessão que será preenchida pelo fluxo realtime.
 */
export function VoterSessionPage(): ReactElement {
  return (
    <main>
      <h1>Voter session</h1>
      <p>Your session is ready.</p>
    </main>
  );
}
