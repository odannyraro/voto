import type { AdminElectionDTO, Election, Position, Round } from '@voto/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { createMockApiServer } from './msw/mock-api-server';
import { createFakeSocket, type FakeSocket } from './utils/fake-socket';
import { makeAdminElectionDTO, makeErrorDTO, makeRoundResultDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const ADMIN_TOKEN = 'admin-session-token';
const ADMIN_TOKEN_KEY = 'voto:admin-token';
const ELECTION_ID = 'election-1';
const POSITION: Position = {
  id: 'position-1',
  title: 'President',
  tiebreak: 'YOUNGEST',
  status: 'PENDING',
};
const mockApi = createMockApiServer();

let serverState: AdminElectionDTO;
let socket: FakeSocket;
let openRoundBody: { positionId: string; durationSeconds?: number } | undefined;
let closedRoundId: string | undefined;
let openedRunoffPositionId: string | undefined;
let releasedRoundId: string | undefined;
let annulledRoundId: string | undefined;
let undoCount: number;
let attachedCandidateId: string | undefined;
let deferredPositionId: string | undefined;
let cancelledPositionId: string | undefined;
let cancelBody: { confirmTitle: string } | undefined;
let releaseFailure: boolean;

beforeAll(() => {
  mockApi.listen();
});

beforeEach(() => {
  serverState = makeAdminElectionDTO({
    election: makeElection({ positions: [POSITION], queue: [POSITION.id] }),
    next: { status: 'READY', positionId: POSITION.id },
  });
  socket = createFakeSocket();
  openRoundBody = undefined;
  closedRoundId = undefined;
  openedRunoffPositionId = undefined;
  releasedRoundId = undefined;
  annulledRoundId = undefined;
  undoCount = 0;
  attachedCandidateId = undefined;
  deferredPositionId = undefined;
  cancelledPositionId = undefined;
  cancelBody = undefined;
  releaseFailure = false;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, ADMIN_TOKEN);
  mockApi.use(
    http.get('*/api/admin/me', () => HttpResponse.json({ id: 'admin-1', username: 'admin' })),
    http.get('*/api/elections/:id', () => HttpResponse.json(serverState)),
    http.post('*/api/elections/:id/rounds', async ({ request }) => {
      openRoundBody = (await request.json()) as { positionId: string; durationSeconds?: number };
      serverState = makeAdminElectionDTO({
        ...serverState,
        election: {
          ...serverState.election,
          queue: [],
          positions: [{ ...POSITION, status: 'VOTING' }],
        },
        currentRound: {
          roundId: 'round-1',
          positionTitle: POSITION.title,
          kind: 'FIRST',
          candidates: [{ id: 'candidate-1', name: 'Ana' }],
          deadline: '2026-11-27T23:00:00.000Z',
          votedCount: 0,
          eligibleCount: 3,
        },
        next: { status: 'ROUND_IN_PROGRESS', positionId: POSITION.id },
      });
      return HttpResponse.json(serverState, { status: 201 });
    }),
    http.post('*/api/elections/:id/rounds/:roundId/close', ({ params }) => {
      closedRoundId = String(params.roundId);
      serverState = makeAdminElectionDTO({
        ...serverState,
        election: {
          ...serverState.election,
          queue: [POSITION.id],
          positions: [{ ...POSITION, status: 'PENDING' }],
        },
        currentRound: undefined,
        next: { status: 'READY', positionId: POSITION.id },
      });
      return HttpResponse.json(serverState);
    }),
    http.post('*/api/elections/:id/positions/:positionId/runoff', ({ params }) => {
      openedRunoffPositionId = String(params.positionId);
      serverState = makeAdminElectionDTO({
        ...serverState,
        election: {
          ...serverState.election,
          positions: [{ ...POSITION, status: 'VOTING' }],
        },
        currentRound: {
          roundId: 'runoff-1',
          positionTitle: POSITION.title,
          kind: 'RUNOFF',
          candidates: [
            { id: 'candidate-1', name: 'Ana' },
            { id: 'candidate-2', name: 'Bia' },
          ],
          deadline: '2026-11-27T23:00:00.000Z',
          votedCount: 0,
          eligibleCount: 3,
        },
        next: { status: 'ROUND_IN_PROGRESS', positionId: POSITION.id },
      });
      return HttpResponse.json(serverState, { status: 201 });
    }),
    http.post('*/api/elections/:id/rounds/:roundId/release', ({ params }) => {
      if (releaseFailure) {
        return HttpResponse.json(
          makeErrorDTO({ code: 'ROUND_NOT_OPEN', message: 'Round is not available.' }),
          { status: 409 },
        );
      }

      releasedRoundId = String(params.roundId);
      serverState = makeAdminElectionDTO({
        ...serverState,
        election: {
          ...serverState.election,
          rounds: serverState.election.rounds.map((round) => ({
            ...round,
            resultsReleased: true,
          })),
        },
      });
      return HttpResponse.json(serverState);
    }),
    http.post('*/api/elections/:id/rounds/:roundId/annul', ({ params }) => {
      annulledRoundId = String(params.roundId);
      serverState = makeAdminElectionDTO({
        ...serverState,
        election: {
          ...serverState.election,
          positions: [{ ...POSITION, status: 'PENDING' }],
          queue: [POSITION.id],
          rounds: serverState.election.rounds.map((round) => ({
            ...round,
            status: 'ANNULLED',
          })),
        },
        lastResult: undefined,
        next: { status: 'READY', positionId: POSITION.id },
      });
      return HttpResponse.json(serverState);
    }),
    http.post('*/api/elections/:id/undo', () => {
      undoCount += 1;
      serverState = makeAdminElectionDTO({
        ...serverState,
        lastResult: undefined,
        canUndo: false,
        next: { status: 'READY', positionId: POSITION.id },
      });
      return HttpResponse.json(serverState);
    }),
    http.post('*/api/elections/:id/positions/:positionId/candidates/:candidateId', ({ params }) => {
      attachedCandidateId = String(params.candidateId);
      serverState = makeAdminElectionDTO({
        ...serverState,
        next: { status: 'READY', positionId: POSITION.id },
      });
      return HttpResponse.json(serverState);
    }),
    http.post('*/api/elections/:id/positions/:positionId/defer', ({ params }) => {
      deferredPositionId = String(params.positionId);
      serverState = makeAdminElectionDTO({
        ...serverState,
        next: { status: 'NONE_LEFT' },
      });
      return HttpResponse.json(serverState);
    }),
    http.post('*/api/elections/:id/positions/:positionId/cancel', async ({ params, request }) => {
      cancelledPositionId = String(params.positionId);
      cancelBody = (await request.json()) as { confirmTitle: string };
      serverState = makeAdminElectionDTO({
        ...serverState,
        next: { status: 'NONE_LEFT' },
      });
      return HttpResponse.json(serverState);
    }),
  );
});

afterEach(() => {
  mockApi.reset();
  sessionStorage.clear();
});

afterAll(() => {
  mockApi.close();
});

/**
 * Builds an election for realtime test scenarios.
 *
 * @param overrides - Fields relevant to a scenario.
 * @returns A complete deterministic election aggregate.
 */
function makeElection(overrides: Partial<Election> = {}): Election {
  return {
    id: ELECTION_ID,
    adminId: 'admin-1',
    name: 'Student Council',
    status: 'OPEN',
    defaultVotingSeconds: 60,
    positions: [],
    queue: [],
    candidates: [],
    voters: [],
    rounds: [],
    version: 1,
    ...overrides,
  };
}

/**
 * Cria uma rodada fechada cujo resultado pode ser gerenciado pelo administrador.
 *
 * @param resultsReleased - Indica se os eleitores já podem ver o resultado.
 * @returns Rodada fechada completa e determinística.
 */
function makeClosedRound(resultsReleased = false): Round {
  return {
    id: 'round-1',
    positionId: POSITION.id,
    kind: 'FIRST',
    candidateIds: ['candidate-1', 'candidate-2'],
    eligibleVoterIds: ['voter-1', 'voter-2', 'voter-3'],
    votedVoterIds: ['voter-1', 'voter-2', 'voter-3'],
    tally: { 'candidate-1': 2, 'candidate-2': 0, BLANK: 1 },
    openedAt: '2026-11-27T22:00:00.000Z',
    deadline: '2026-11-27T23:00:00.000Z',
    status: 'CLOSED',
    resultsReleased,
  };
}

/**
 * Prepara uma rodada fechada e seu resultado calculado pelo servidor.
 *
 * @param outcome - Desfecho discriminado que será apresentado e resolvido.
 * @returns Estado administrativo completo para o cenário.
 */
function makeResultState(
  outcome: 'ELECTED' | 'RUNOFF_REQUIRED' | 'NO_VALID_VOTES',
): AdminElectionDTO {
  const result = makeRoundResultDTO({
    counts:
      outcome === 'NO_VALID_VOTES'
        ? []
        : [
            { candidateId: 'candidate-1', name: 'Ana', votes: 2 },
            { candidateId: 'candidate-2', name: 'Bia', votes: 0 },
          ],
    blank: outcome === 'NO_VALID_VOTES' ? 3 : 1,
    validVotes: outcome === 'NO_VALID_VOTES' ? 0 : 2,
    outcome,
    tiebreakApplied: outcome === 'ELECTED',
    electedCandidateId: outcome === 'ELECTED' ? 'candidate-1' : undefined,
    runoffCandidateIds: outcome === 'RUNOFF_REQUIRED' ? ['candidate-1', 'candidate-2'] : undefined,
  });

  return makeAdminElectionDTO({
    election: makeElection({
      positions: [
        {
          ...POSITION,
          status: outcome === 'RUNOFF_REQUIRED' ? 'AWAITING_RUNOFF' : 'DECIDED',
        },
      ],
      rounds: [makeClosedRound()],
    }),
    lastResult: result,
    next:
      outcome === 'RUNOFF_REQUIRED'
        ? { status: 'AWAITING_RUNOFF', positionId: POSITION.id }
        : { status: 'NONE_LEFT' },
    canUndo: true,
  });
}

/**
 * Renders the live tab and stores the socket created by the application.
 *
 * @returns Promise resolved when the live panel is ready.
 */
async function renderLivePanel(): Promise<void> {
  const user = userEvent.setup();
  renderWithProviders(<App createSocketClient={() => socket} />, {
    initialEntries: [`/admin/eleicoes/${ELECTION_ID}/configurar`],
  });
  await user.click(await screen.findByRole('tab', { name: 'Ao vivo' }));
  await screen.findByRole('tabpanel', { name: 'Ao vivo' });
}

describe('administrator live election state', () => {
  it('loads the initial election state and watches its socket room', async () => {
    await renderLivePanel();

    expect({
      ready: await screen.findByText('Pronto para iniciar: President'),
      watchedElections: socket.watchedElections,
    }).toEqual({
      ready: expect.any(HTMLElement),
      watchedElections: [ELECTION_ID],
    });
  });

  it('replaces REST state with the full snapshot received over the socket', async () => {
    await renderLivePanel();
    const socketState = makeAdminElectionDTO({
      election: makeElection({ name: 'Socket Election' }),
      next: { status: 'NONE_LEFT' },
    });
    socket.emitAdminState(socketState);

    expect(await screen.findByText('Não há mais cargos na fila.')).toBeInTheDocument();
  });

  it('reports an incomplete active-round snapshot from the server', async () => {
    await renderLivePanel();
    socket.emitAdminState(
      makeAdminElectionDTO({
        election: makeElection({ positions: [POSITION] }),
        next: { status: 'ROUND_IN_PROGRESS', positionId: POSITION.id },
      }),
    );

    expect(
      await screen.findByText(
        'O servidor informa uma rodada ativa, mas não forneceu os dados dela.',
      ),
    ).toBeInTheDocument();
  });

  it('watches again and resynchronizes from REST after reconnecting', async () => {
    await renderLivePanel();
    socket.reconnect();

    expect({
      ready: await screen.findByText('Pronto para iniciar: President'),
      watchedElections: socket.watchedElections,
    }).toEqual({
      ready: expect.any(HTMLElement),
      watchedElections: [ELECTION_ID, ELECTION_ID],
    });
  });

  it('shows the in-progress round and closes it using its current round identifier', async () => {
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(screen.getByRole('button', { name: 'Abrir rodada' }));
    await screen.findByText('Votação em andamento: President');

    expect({
      body: openRoundBody,
      progress: screen.getByText('Votos: 0 de 3'),
      deadline: screen.getByText(/Prazo da votação:/),
      countdown: screen.getByRole('timer', { name: 'Tempo restante' }),
    }).toEqual({
      body: { positionId: POSITION.id },
      progress: expect.any(HTMLElement),
      deadline: expect.any(HTMLElement),
      countdown: expect.any(HTMLElement),
    });

    await user.click(screen.getByRole('button', { name: 'Encerrar rodada antecipadamente' }));

    expect({
      roundId: closedRoundId,
      ready: await screen.findByText('Pronto para iniciar: President'),
    }).toEqual({ roundId: 'round-1', ready: expect.any(HTMLElement) });
  });

  it('sends a validated custom duration when opening a round', async () => {
    const user = userEvent.setup();
    await renderLivePanel();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duração da rodada (segundos)' }), {
      target: { value: '120' },
    });
    await user.click(screen.getByRole('button', { name: 'Abrir rodada' }));

    expect(openRoundBody).toEqual({ positionId: POSITION.id, durationSeconds: 120 });
  });

  it.each(['4', '3601', '60.5'])('rejects invalid round duration %s', async (duration) => {
    const user = userEvent.setup();
    await renderLivePanel();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duração da rodada (segundos)' }), {
      target: { value: duration },
    });
    await user.click(screen.getByRole('button', { name: 'Abrir rodada' }));

    expect({
      message: screen.getByRole('alert'),
      requestBody: openRoundBody,
    }).toEqual({
      message: expect.objectContaining({
        textContent: 'A duração da votação deve ser um número inteiro entre 5 e 3.600 segundos.',
      }),
      requestBody: undefined,
    });
  });

  it('shows the server-calculated elected result and releases it to voters', async () => {
    serverState = makeResultState('ELECTED');
    const user = userEvent.setup();
    await renderLivePanel();

    expect({
      outcome: await screen.findByText('Pessoa eleita: Ana.'),
      counts: screen.getByText('Ana: 2 votos'),
      totals: screen.getByText('Votos válidos: 2; votos em branco: 1.'),
      tiebreak: screen.getByText('A regra de desempate do cargo determinou o resultado.'),
    }).toEqual({
      outcome: expect.any(HTMLElement),
      counts: expect.any(HTMLElement),
      totals: expect.any(HTMLElement),
      tiebreak: expect.any(HTMLElement),
    });

    await user.click(screen.getByRole('button', { name: 'Divulgar resultado aos eleitores' }));
    const releasedMessage = await screen.findByText('Resultado divulgado aos eleitores.');

    expect({
      releasedRoundId,
      releaseButton: screen.queryByRole('button', { name: 'Divulgar resultado aos eleitores' }),
      releasedMessage,
    }).toEqual({
      releasedRoundId: 'round-1',
      releaseButton: null,
      releasedMessage: expect.any(HTMLElement),
    });
  });

  it('opens the server-declared runoff finalists for the queued position', async () => {
    serverState = makeResultState('RUNOFF_REQUIRED');
    const user = userEvent.setup();
    await renderLivePanel();

    expect(await screen.findByText('Segundo turno entre Ana e Bia.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir segundo turno' }));

    expect({
      positionId: openedRunoffPositionId,
      votingRound: await screen.findByText('Votação em andamento: President'),
    }).toEqual({
      positionId: POSITION.id,
      votingRound: expect.any(HTMLElement),
    });
  });

  it('shows the no-valid-votes outcome without offering a runoff', async () => {
    serverState = makeResultState('NO_VALID_VOTES');
    await renderLivePanel();

    expect({
      outcome: await screen.findByText('Não houve votos válidos.'),
      runoffButton: screen.queryByRole('button', { name: 'Abrir segundo turno' }),
    }).toEqual({ outcome: expect.any(HTMLElement), runoffButton: null });
  });

  it('shows the server error when result release fails', async () => {
    serverState = makeResultState('ELECTED');
    releaseFailure = true;
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(
      await screen.findByRole('button', { name: 'Divulgar resultado aos eleitores' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta rodada não está aberta para votação.',
    );
    expect({
      releasedRoundId,
      releaseButton: screen.getByRole('button', { name: 'Divulgar resultado aos eleitores' }),
    }).toEqual({
      releasedRoundId: undefined,
      releaseButton: expect.any(HTMLElement),
    });
  });

  it('undoes the last election action when the server permits it', async () => {
    serverState = makeResultState('ELECTED');
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(await screen.findByRole('button', { name: 'Desfazer última ação' }));

    expect({
      undoCount,
      result: screen.queryByRole('heading', { name: 'Resultado da última rodada' }),
    }).toEqual({ undoCount: 1, result: null });
  });

  it('requires confirmation before annulling the displayed round', async () => {
    serverState = makeResultState('ELECTED');
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(await screen.findByRole('button', { name: 'Anular rodada' }));
    const confirmation = screen.getByRole('dialog', { name: 'Anular rodada?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Anular rodada' }));

    expect({
      roundId: annulledRoundId,
      result: screen.queryByRole('heading', { name: 'Resultado da última rodada' }),
    }).toEqual({ roundId: 'round-1', result: null });
  });

  it('shows attachable candidates only for a position with insufficient candidates', async () => {
    serverState = makeAdminElectionDTO({
      election: makeElection({ positions: [POSITION], queue: [POSITION.id] }),
      next: {
        status: 'INSUFFICIENT_CANDIDATES',
        positionId: POSITION.id,
        attachableCandidates: [{ id: 'candidate-1', name: 'Ana' }],
      },
    });
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(await screen.findByRole('button', { name: 'Vincular Ana' }));

    expect({
      candidateId: attachedCandidateId,
      ready: await screen.findByText('Pronto para iniciar: President'),
    }).toEqual({ candidateId: 'candidate-1', ready: expect.any(HTMLElement) });
  });

  it('defers a position whose candidate count is insufficient', async () => {
    serverState = makeAdminElectionDTO({
      election: makeElection({ positions: [POSITION], queue: [POSITION.id] }),
      next: { status: 'INSUFFICIENT_CANDIDATES', positionId: POSITION.id },
    });
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(await screen.findByRole('button', { name: 'Adiar President' }));

    expect({
      positionId: deferredPositionId,
      state: await screen.findByText('Não há mais cargos na fila.'),
    }).toEqual({ positionId: POSITION.id, state: expect.any(HTMLElement) });
  });

  it('cancels a position only after typing its exact title', async () => {
    serverState = makeAdminElectionDTO({
      election: makeElection({ positions: [POSITION], queue: [POSITION.id] }),
      next: { status: 'INSUFFICIENT_CANDIDATES', positionId: POSITION.id },
    });
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(await screen.findByRole('button', { name: 'Cancelar President' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    const confirmation = screen.getByRole('dialog', { name: 'Confirmar cancelamento' });
    const input = within(confirmation).getByRole('textbox', {
      name: 'Digite o nome do cargo para confirmar',
    });
    const confirmButton = within(confirmation).getByRole('button', { name: 'Cancelar cargo' });

    expect(confirmButton).toBeDisabled();

    await user.type(input, 'president');
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'President');
    await user.click(confirmButton);

    expect({
      positionId: cancelledPositionId,
      body: cancelBody,
      state: await screen.findByText('Não há mais cargos na fila.'),
    }).toEqual({
      positionId: POSITION.id,
      body: { confirmTitle: 'President' },
      state: expect.any(HTMLElement),
    });
  });

  it('does not show insufficient-candidate actions for a ready position', async () => {
    await renderLivePanel();

    expect({
      attach: screen.queryByRole('button', { name: /^Vincular / }),
      defer: screen.queryByRole('button', { name: /^Adiar / }),
      cancel: screen.queryByRole('button', { name: /^Cancelar / }),
    }).toEqual({ attach: null, defer: null, cancel: null });
  });
});
