import type { AdminElectionDTO } from '@voto/shared';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';
import { adminApi } from '../../../api/admin-api';
import { ApiError } from '../../../api/api-client';
import { useAdminAuth } from '../auth/admin-auth-context';
import { PositionsTab } from '../config/PositionsTab';

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
          error instanceof ApiError
            ? `${error.error?.code ?? 'API_ERROR'}: ${error.error?.message ?? error.message}`
            : 'Unable to load this election. Check your connection and try again.',
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
        <p role="alert">Election identifier is missing.</p>
      </main>
    );
  }

  if (loadError !== undefined) {
    return (
      <main>
        <h1>Election configuration</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }

  if (election === undefined) {
    return <p role="status">Loading election configuration...</p>;
  }

  return (
    <main>
      <h1>Election configuration</h1>
      <p>Election ID: {electionId}</p>
      <p>Election: {election.election.name}</p>
      <PositionsTab
        token={token}
        electionId={electionId}
        state={election}
        onElectionChange={setElection}
      />
    </main>
  );
}
