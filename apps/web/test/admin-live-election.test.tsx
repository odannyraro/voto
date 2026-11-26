import type { AdminElectionDTO, Election, Position } from '@voto/shared';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { createMockApiServer } from './msw/mock-api-server';
import { createFakeSocket, type FakeSocket } from './utils/fake-socket';
import { makeAdminElectionDTO } from './utils/factories';
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
 * Renders the live tab and stores the socket created by the application.
 *
 * @returns Promise resolved when the live panel is ready.
 */
async function renderLivePanel(): Promise<void> {
  const user = userEvent.setup();
  renderWithProviders(<App createSocketClient={() => socket} />, {
    initialEntries: [`/admin/eleicoes/${ELECTION_ID}/configurar`],
  });
  await user.click(await screen.findByRole('tab', { name: 'Live' }));
  await screen.findByRole('tabpanel', { name: 'Live' });
}

describe('administrator live election state', () => {
  it('loads the initial election state and watches its socket room', async () => {
    await renderLivePanel();

    expect({
      ready: await screen.findByText('Ready to open: President'),
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

    expect(await screen.findByText('No positions remain in the queue.')).toBeInTheDocument();
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
      await screen.findByText('The server reports an active round but did not provide its state.'),
    ).toBeInTheDocument();
  });

  it('watches again and resynchronizes from REST after reconnecting', async () => {
    await renderLivePanel();
    socket.reconnect();

    expect({
      ready: await screen.findByText('Ready to open: President'),
      watchedElections: socket.watchedElections,
    }).toEqual({
      ready: expect.any(HTMLElement),
      watchedElections: [ELECTION_ID, ELECTION_ID],
    });
  });

  it('shows the in-progress round and closes it using its current round identifier', async () => {
    const user = userEvent.setup();
    await renderLivePanel();
    await user.click(screen.getByRole('button', { name: 'Open round' }));
    await screen.findByText('Voting in progress: President');

    expect({
      body: openRoundBody,
      progress: screen.getByText('Votes: 0 of 3'),
      deadline: screen.getByText(/Voting deadline:/),
      countdown: screen.getByRole('timer', { name: 'Time remaining' }),
    }).toEqual({
      body: { positionId: POSITION.id },
      progress: expect.any(HTMLElement),
      deadline: expect.any(HTMLElement),
      countdown: expect.any(HTMLElement),
    });

    await user.click(screen.getByRole('button', { name: 'Close round early' }));

    expect({
      roundId: closedRoundId,
      ready: await screen.findByText('Ready to open: President'),
    }).toEqual({ roundId: 'round-1', ready: expect.any(HTMLElement) });
  });

  it('sends a validated custom duration when opening a round', async () => {
    const user = userEvent.setup();
    await renderLivePanel();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Round duration (seconds)' }), {
      target: { value: '120' },
    });
    await user.click(screen.getByRole('button', { name: 'Open round' }));

    expect(openRoundBody).toEqual({ positionId: POSITION.id, durationSeconds: 120 });
  });

  it.each(['4', '3601', '60.5'])('rejects invalid round duration %s', async (duration) => {
    const user = userEvent.setup();
    await renderLivePanel();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Round duration (seconds)' }), {
      target: { value: duration },
    });
    await user.click(screen.getByRole('button', { name: 'Open round' }));

    expect({
      message: screen.getByRole('alert'),
      requestBody: openRoundBody,
    }).toEqual({
      message: expect.objectContaining({
        textContent: 'Round duration must be a whole number from 5 to 3600 seconds.',
      }),
      requestBody: undefined,
    });
  });
});
