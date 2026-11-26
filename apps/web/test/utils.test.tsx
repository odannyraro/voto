import type { PropsWithChildren, ReactElement } from 'react';
import { createContext, useContext } from 'react';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  makeAdminElectionDTO,
  makeErrorDTO,
  makeElectionSummaryDTO,
  makeRoundResultDTO,
  makeRoundView,
  makeVoterStateDTO,
} from './utils/factories';
import { createTestFaker } from './utils/faker';
import { renderWithProviders } from './utils/render-with-providers';

const AuthContext = createContext('anonymous');
const SocketContext = createContext('disconnected');

interface ProviderProps extends PropsWithChildren {
  readonly value: string;
}

/**
 * Fornece identidade de admin fictícia para verificar o provider de teste.
 *
 * @param props - Valor identificador e conteúdo renderizado pelo provider.
 * @returns Conteúdo sob o contexto de autenticação.
 */
function AuthProvider({ children, value }: ProviderProps): ReactElement {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Fornece estado de conexão fictício para verificar o provider de teste.
 *
 * @param props - Valor identificador e conteúdo renderizado pelo provider.
 * @returns Conteúdo sob o contexto do socket.
 */
function SocketProvider({ children, value }: ProviderProps): ReactElement {
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/**
 * Apresenta os valores dos providers e a localização ativa para o teste de composição.
 *
 * @returns Resumo observável dos contextos e da rota atual.
 */
function ProviderConsumer(): ReactElement {
  const auth = useContext(AuthContext);
  const socket = useContext(SocketContext);
  const location = useLocation();

  return <p>{`${auth}|${socket}|${location.pathname}`}</p>;
}

describe('renderWithProviders', () => {
  it('composes the router with configurable auth and socket providers', () => {
    const { getByText } = renderWithProviders(<ProviderConsumer />, {
      initialEntries: ['/admin'],
      authProvider: ({ children }) => <AuthProvider value="admin-a">{children}</AuthProvider>,
      socketProvider: ({ children }) => (
        <SocketProvider value="connected-a">{children}</SocketProvider>
      ),
    });

    expect(getByText('admin-a|connected-a|/admin')).toBeInTheDocument();
  });

  it('isolates provider values and initial routes between renders', () => {
    const firstRender = renderWithProviders(<ProviderConsumer />, {
      initialEntries: ['/first'],
      authProvider: ({ children }) => <AuthProvider value="first-admin">{children}</AuthProvider>,
      socketProvider: ({ children }) => (
        <SocketProvider value="first-socket">{children}</SocketProvider>
      ),
    });
    firstRender.unmount();

    const secondRender = renderWithProviders(<ProviderConsumer />, {
      initialEntries: ['/second'],
      authProvider: ({ children }) => <AuthProvider value="second-admin">{children}</AuthProvider>,
      socketProvider: ({ children }) => (
        <SocketProvider value="second-socket">{children}</SocketProvider>
      ),
    });

    expect(secondRender.getByText('second-admin|second-socket|/second')).toBeInTheDocument();
  });
});

describe('test data factories', () => {
  it('uses deterministic Brazilian Portuguese names for non-semantic defaults', () => {
    const names = [createTestFaker().person.firstName(), createTestFaker().person.firstName()];

    expect(names).toEqual(['Fabrício', 'Fabrício']);
  });

  it('preserves selected election summary values over deterministic defaults', () => {
    const summary = makeElectionSummaryDTO({
      id: 'election-special',
      name: 'Student Election',
      positionCount: 2,
    });

    expect(summary).toMatchObject({
      id: 'election-special',
      name: 'Student Election',
      status: 'DRAFT',
      positionCount: 2,
      voterCount: 0,
    });
  });

  it('uses localized Faker data in default DTO display names', () => {
    const summary = makeElectionSummaryDTO();
    const round = makeRoundView();

    expect({
      electionName: summary.name,
      candidateName: round.candidates[0]?.name,
    }).toEqual({
      electionName: createTestFaker().company.name(),
      candidateName: createTestFaker().person.firstName(),
    });
  });

  it('creates a valid admin DTO with an overridden election', () => {
    const adminState = makeAdminElectionDTO({
      election: {
        id: 'election-special',
        adminId: 'admin-test',
        name: 'Student Election',
        status: 'OPEN',
        defaultVotingSeconds: 30,
        positions: [],
        queue: [],
        candidates: [],
        voters: [],
        rounds: [],
        version: 3,
      },
    });

    expect(adminState.election).toMatchObject({
      id: 'election-special',
      name: 'Student Election',
      status: 'OPEN',
      version: 3,
    });
  });

  it('creates round DTOs with scenario-specific ballot and result fields', () => {
    const round = makeRoundView({
      roundId: 'round-special',
      candidates: [{ id: 'candidate-special', name: 'Bia' }],
    });
    const result = makeRoundResultDTO({
      outcome: 'RUNOFF_REQUIRED',
      electedCandidateId: undefined,
      runoffCandidateIds: ['candidate-1', 'candidate-2'],
    });

    expect({ round, result }).toMatchObject({
      round: {
        roundId: 'round-special',
        candidates: [{ id: 'candidate-special', name: 'Bia' }],
      },
      result: {
        outcome: 'RUNOFF_REQUIRED',
        runoffCandidateIds: ['candidate-1', 'candidate-2'],
      },
    });
  });

  it('creates voter and error DTOs with selected contract fields', () => {
    const voterState = makeVoterStateDTO({
      phase: 'VOTED',
      roundId: 'round-special',
    });
    const error = makeErrorDTO({
      code: 'INVALID_CODE',
      message: 'Invalid voter code',
    });

    expect({ voterState, error }).toMatchObject({
      voterState: { phase: 'VOTED', roundId: 'round-special' },
      error: { error: { code: 'INVALID_CODE', message: 'Invalid voter code' } },
    });
  });
});
