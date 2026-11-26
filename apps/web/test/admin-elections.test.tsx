import type { CreateElectionBody, ElectionSummaryDTO } from '@voto/shared';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { createMockApiServer } from './msw/mock-api-server';
import { makeAdminElectionDTO, makeElectionSummaryDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const ADMIN_TOKEN = 'admin-session-token';
const ADMIN_TOKEN_KEY = 'voto:admin-token';
const NEW_ELECTION_ID = 'election-new';
const mockApi = createMockApiServer();
const firstElection = makeElectionSummaryDTO({
  id: 'election-1',
  name: 'Student Council',
  status: 'DRAFT',
  positionCount: 2,
  voterCount: 12,
});
const openElection = makeElectionSummaryDTO({
  id: 'election-2',
  name: 'Faculty Election',
  status: 'OPEN',
  positionCount: 1,
  voterCount: 5,
});

let elections: ElectionSummaryDTO[];
let createdBody: CreateElectionBody | undefined;

beforeAll(() => {
  mockApi.listen();
});

beforeEach(() => {
  elections = [];
  createdBody = undefined;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, ADMIN_TOKEN);
  mockApi.use(
    http.get('*/api/admin/me', () => HttpResponse.json({ id: 'admin-1', username: 'admin' })),
    http.get('*/api/elections', () => HttpResponse.json(elections)),
    http.get('*/api/elections/:id', ({ params }) =>
      HttpResponse.json(
        makeAdminElectionDTO({
          election: {
            ...makeAdminElectionDTO().election,
            id: String(params.id),
          },
        }),
      ),
    ),
    http.post('*/api/elections', async ({ request }) => {
      createdBody = (await request.json()) as CreateElectionBody;
      const createdElection = makeAdminElectionDTO({
        election: {
          ...makeAdminElectionDTO().election,
          id: NEW_ELECTION_ID,
          name: createdBody.name,
          defaultVotingSeconds: createdBody.defaultVotingSeconds ?? 60,
        },
      });
      elections = [
        ...elections,
        makeElectionSummaryDTO({
          id: createdElection.election.id,
          name: createdElection.election.name,
          status: createdElection.election.status,
          positionCount: createdElection.election.positions.length,
          voterCount: createdElection.election.voters.length,
        }),
      ];

      return HttpResponse.json(createdElection, { status: 201 });
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

describe('administrator elections', () => {
  it('shows an empty state when the administrator has no elections', async () => {
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    expect(
      await screen.findByText('No elections yet. Create one to get started.'),
    ).toBeInTheDocument();
  });

  it('shows election status and counts from each summary', async () => {
    elections = [firstElection, openElection];
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    expect(await screen.findByRole('list', { name: 'Elections' })).toHaveTextContent(
      'Student CouncilStatus: DRAFT2 positions12 votersFaculty ElectionStatus: OPEN1 position5 voters',
    );
  });

  it('shows an API error when elections cannot be loaded', async () => {
    mockApi.use(
      http.get('*/api/elections', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Elections are unavailable.' } },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    expect(await screen.findByRole('alert')).toHaveTextContent('Elections are unavailable.');
  });

  it('does not create an election when its name is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    await screen.findByRole('heading', { name: 'Administrator dashboard' });
    await user.click(screen.getByRole('button', { name: 'Create election' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Election name is required.');
  });

  it.each(['4', '3601', '60.5'])(
    'rejects a default voting duration outside whole seconds: %s',
    async (duration) => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialEntries: ['/admin'] });
      await screen.findByRole('heading', { name: 'Administrator dashboard' });
      await user.type(screen.getByRole('textbox', { name: 'Election name' }), 'New election');
      fireEvent.change(
        screen.getByRole('spinbutton', { name: 'Default voting duration (seconds)' }),
        {
          target: { value: duration },
        },
      );
      await user.click(screen.getByRole('button', { name: 'Create election' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Voting duration must be a whole number from 5 to 3600 seconds.',
      );
    },
  );

  it.each(['5', '3600'])('accepts the voting duration boundary of %s seconds', async (duration) => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin'] });
    await screen.findByRole('heading', { name: 'Administrator dashboard' });
    await user.type(screen.getByRole('textbox', { name: 'Election name' }), 'New election');
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Default voting duration (seconds)' }),
      {
        target: { value: duration },
      },
    );
    await user.click(screen.getByRole('button', { name: 'Create election' }));

    expect(createdBody).toEqual({ name: 'New election', defaultVotingSeconds: Number(duration) });
  });

  it('creates an election with the selected default and navigates to its configuration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    await screen.findByRole('heading', { name: 'Administrator dashboard' });
    await user.type(screen.getByRole('textbox', { name: 'Election name' }), 'New election');
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Default voting duration (seconds)' }),
      {
        target: { value: '90' },
      },
    );
    await user.click(screen.getByRole('button', { name: 'Create election' }));

    expect({
      requestBody: createdBody,
      destination: await screen.findByRole('heading', { name: 'Election configuration' }),
      electionId: screen.getByText(`Election ID: ${NEW_ELECTION_ID}`),
    }).toEqual({
      requestBody: { name: 'New election', defaultVotingSeconds: 90 },
      destination: expect.any(HTMLElement),
      electionId: expect.any(HTMLElement),
    });
  });

  it('shows an API error when election creation fails', async () => {
    mockApi.use(
      http.post('*/api/elections', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Election could not be created.' } },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    await screen.findByRole('heading', { name: 'Administrator dashboard' });
    await user.type(screen.getByRole('textbox', { name: 'Election name' }), 'New election');
    await user.click(screen.getByRole('button', { name: 'Create election' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Election could not be created.');
  });
});
