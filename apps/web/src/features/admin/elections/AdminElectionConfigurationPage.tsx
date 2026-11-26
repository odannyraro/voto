import type { ReactElement } from 'react';
import { useParams } from 'react-router';

/**
 * Confirma o destino da eleição criada enquanto as ferramentas de configuração são desenvolvidas.
 *
 * @returns Identificador da eleição selecionada para configurar.
 */
export function AdminElectionConfigurationPage(): ReactElement {
  const { electionId } = useParams();

  return (
    <main>
      <h1>Election configuration</h1>
      <p>Election ID: {electionId}</p>
    </main>
  );
}
