import type { AdminElectionDTO } from '@voto/shared';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { getApiErrorMessage } from '../../../lib/ui-messages';
import { useAdminAuth } from '../auth/admin-auth-context';
import { AdminLivePanel } from '../live/AdminLivePanel';
import { CandidatesTab } from '../config/CandidatesTab';
import { QueueTab } from '../config/QueueTab';
import { PositionsTab } from '../config/PositionsTab';
import { VotersTab } from '../config/VotersTab';

type ConfigurationTab = 'Positions' | 'Candidates' | 'Voters' | 'Order' | 'Live';

const CONFIGURATION_TABS: readonly ConfigurationTab[] = [
  'Positions',
  'Candidates',
  'Voters',
  'Order',
  'Live',
];

/**
 * Traduz a identificação interna de uma aba para o rótulo apresentado na interface.
 *
 * @param tab - Chave estável usada para controlar a aba selecionada.
 * @returns Nome da seção em português.
 */
function getConfigurationTabLabel(tab: ConfigurationTab): string {
  switch (tab) {
    case 'Positions':
      return 'Cargos';
    case 'Candidates':
      return 'Candidaturas';
    case 'Voters':
      return 'Eleitores';
    case 'Order':
      return 'Ordem';
    case 'Live':
      return 'Ao vivo';
  }
}

/**
 * Carrega uma eleição administrativa e apresenta sua configuração de cargos.
 *
 * @returns Estado de carregamento/erro ou a configuração protegida da eleição.
 */
export function AdminElectionConfigurationPage(): ReactElement {
  const { electionId } = useParams();
  const { token } = useAdminAuth();
  const [election, setElection] = useState<AdminElectionDTO>();
  const [loadError, setLoadError] = useState<string>();
  const [selectedTab, setSelectedTab] = useState<ConfigurationTab>('Positions');

  useEffect(() => {
    let active = true;
    setElection(undefined);
    setLoadError(undefined);

    async function loadElection(): Promise<void> {
      if (token === null || electionId === undefined) {
        return;
      }

      try {
        const state = await adminApi.getElection(token, electionId);
        if (active) {
          setElection(state);
        }
      } catch (error: unknown) {
        if (!active) {
          return;
        }
        setLoadError(
          error instanceof ApiError && error.error !== undefined
            ? getApiErrorMessage(error.error.code)
            : 'Não foi possível carregar esta eleição. Confira sua conexão e tente novamente.',
        );
      }
    }

    void loadElection();
    return () => {
      active = false;
    };
  }, [electionId, token]);

  if (token === null) {
    return <Navigate to="/admin/login" replace />;
  }

  if (electionId === undefined) {
    return (
      <main>
        <p role="alert">O identificador da eleição não foi informado.</p>
      </main>
    );
  }

  if (loadError !== undefined) {
    return (
      <main>
        <h1>Configuração da eleição</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }

  if (election === undefined) {
    return <p role="status">Carregando a configuração da eleição...</p>;
  }

  return (
    <main>
      <h1>Configuração da eleição</h1>
      <p>Identificador da eleição: {electionId}</p>
      <p>Eleição: {election.election.name}</p>
      <div role="tablist" aria-label="Configuração da eleição">
        {CONFIGURATION_TABS.map((tab) => (
          <button
            key={tab}
            id={`configuration-tab-${tab.toLowerCase()}`}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab}
            aria-controls={`configuration-panel-${tab.toLowerCase()}`}
            tabIndex={selectedTab === tab ? 0 : -1}
            onClick={() => setSelectedTab(tab)}
          >
            {getConfigurationTabLabel(tab)}
          </button>
        ))}
      </div>
      {CONFIGURATION_TABS.map((tab) => (
        <div
          key={tab}
          id={`configuration-panel-${tab.toLowerCase()}`}
          role="tabpanel"
          aria-labelledby={`configuration-tab-${tab.toLowerCase()}`}
          hidden={selectedTab !== tab}
        >
          {selectedTab === tab && tab === 'Positions' && (
            <PositionsTab
              token={token}
              electionId={electionId}
              state={election}
              onElectionChange={setElection}
            />
          )}
          {selectedTab === tab && tab === 'Candidates' && (
            <CandidatesTab
              token={token}
              electionId={electionId}
              state={election}
              onElectionChange={setElection}
            />
          )}
          {selectedTab === tab && tab === 'Voters' && (
            <VotersTab
              token={token}
              electionId={electionId}
              state={election}
              onElectionChange={setElection}
            />
          )}
          {selectedTab === tab && tab === 'Order' && (
            <QueueTab
              token={token}
              electionId={electionId}
              state={election}
              onElectionChange={setElection}
            />
          )}
          {selectedTab === tab && tab === 'Live' && (
            <AdminLivePanel token={token} electionId={electionId} />
          )}
        </div>
      ))}
    </main>
  );
}
