import type { AdminElectionDTO, Position, Voter } from '@voto/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { createMockApiServer } from './msw/mock-api-server';
import { makeAdminElectionDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const ADMIN_TOKEN = 'admin-session-token';
const ADMIN_TOKEN_KEY = 'voto:admin-token';
const ELECTION_ID = 'election-1';
const positions: readonly Position[] = [
  { id: 'position-1', title: 'President', tiebreak: 'YOUNGEST', status: 'PENDING' },
  { id: 'position-2', title: 'Treasurer', tiebreak: 'OLDEST', status: 'PENDING' },
];
const initialVoters: readonly Voter[] = [
  { id: 'voter-1', code: 'ABCD2345', label: 'Table 1', status: 'CREDENTIALED' },
  { id: 'voter-2', code: 'EFGH6789', status: 'REVOKED' },
];
const mockApi = createMockApiServer();

let electionState: AdminElectionDTO;
let generatedBody: { count: number; labels?: readonly string[] } | undefined;
let appliedQueue: readonly string[] | undefined;
let nextVoterId: number;
let clipboardWrite: ReturnType<typeof vi.fn>;

beforeAll(() => {
  mockApi.listen();
});

beforeEach(() => {
  electionState = makeAdminElectionDTO({
    election: {
      ...makeAdminElectionDTO().election,
      id: ELECTION_ID,
      positions,
      queue: positions.map(({ id }) => id),
      voters: [...initialVoters],
    },
  });
  generatedBody = undefined;
  appliedQueue = undefined;
  nextVoterId = 3;
  clipboardWrite = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  sessionStorage.setItem(ADMIN_TOKEN_KEY, ADMIN_TOKEN);
  mockApi.use(
    http.get('*/api/admin/me', () => HttpResponse.json({ id: 'admin-1', username: 'admin' })),
    http.get('*/api/elections/:id', () => HttpResponse.json(electionState)),
    http.post('*/api/elections/:id/voters', async ({ request }) => {
      const body = (await request.json()) as { count: number; labels?: readonly string[] };
      generatedBody = body;
      const newVoters: Voter[] = Array.from({ length: body.count }, (_, index) => ({
        id: `voter-${nextVoterId++}`,
        code: `CODE${String(index + 1).padStart(4, '0')}`,
        label: body.labels?.[index],
        status: 'CREDENTIALED',
      }));
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          voters: [...electionState.election.voters, ...newVoters],
        },
      };
      return HttpResponse.json(
        { codes: newVoters.map(({ code }) => code), election: electionState },
        { status: 201 },
      );
    }),
    http.delete('*/api/elections/:id/voters/:voterId', ({ params }) => {
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          voters: electionState.election.voters.map((voter) =>
            voter.id === params.voterId ? { ...voter, status: 'REVOKED' } : voter,
          ),
        },
      };
      return HttpResponse.json(electionState);
    }),
    http.get('*/api/elections/:id/queue/suggestion', () =>
      HttpResponse.json({ positionIds: ['position-2', 'position-1'] }),
    ),
    http.put('*/api/elections/:id/queue', async ({ request }) => {
      const body = (await request.json()) as { positionIds: readonly string[] };
      appliedQueue = body.positionIds;
      electionState = {
        ...electionState,
        election: { ...electionState.election, queue: [...body.positionIds] },
      };
      return HttpResponse.json(electionState);
    }),
  );
});

afterEach(() => {
  mockApi.reset();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterAll(() => {
  mockApi.close();
});

/**
 * Renders election configuration and opens its voter or queue tab.
 *
 * @param tab - Configuration tab to select after loading the election.
 * @returns Promise resolved when the requested tab is available.
 */
async function renderConfiguration(tab: 'Voters' | 'Order'): Promise<void> {
  const user = userEvent.setup();
  renderWithProviders(<App />, {
    initialEntries: [`/admin/eleicoes/${ELECTION_ID}/configurar`],
  });

  await user.click(await screen.findByRole('tab', { name: tab }));
  await screen.findByRole('tabpanel', { name: tab });
}

describe('administrator voter and queue configuration', () => {
  it.each(['0', '501'])('rejects a voter batch count of %s', async (count) => {
    await renderConfiguration('Voters');
    const user = userEvent.setup();

    await user.clear(screen.getByRole('spinbutton', { name: 'Number of voters' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Number of voters' }), count);
    await user.click(screen.getByRole('button', { name: 'Generate codes' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Number of voters must be a whole number from 1 to 500.',
    );
  });

  it('generates and lists voter codes with their labels and statuses', async () => {
    await renderConfiguration('Voters');
    const user = userEvent.setup();

    await user.clear(screen.getByRole('spinbutton', { name: 'Number of voters' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Number of voters' }), '2');
    await user.type(
      screen.getByRole('textbox', { name: 'Optional voter labels, one per line' }),
      'Table 3\nTable 4',
    );
    await user.click(screen.getByRole('button', { name: 'Generate codes' }));

    expect({
      request: generatedBody,
      voterList: await screen.findByRole('table', { name: 'Voter credentials' }),
    }).toEqual({
      request: { count: 2, labels: ['Table 3', 'Table 4'] },
      voterList: expect.objectContaining({
        textContent: expect.stringContaining('Table 3CODE0001CREDENTIALED'),
      }),
    });
  });

  it('rejects more labels than the requested voter count', async () => {
    await renderConfiguration('Voters');
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Optional voter labels, one per line' }),
      'Table 1\nTable 2',
    );
    await user.click(screen.getByRole('button', { name: 'Generate codes' }));

    expect({
      message: screen.getByRole('alert').textContent,
      request: generatedBody,
    }).toEqual({
      message: 'Provide no more labels than the number of voters.',
      request: undefined,
    });
  });

  it('copies a voter code and reports clipboard success', async () => {
    await renderConfiguration('Voters');
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    await user.click(screen.getByRole('button', { name: 'Copy code for Table 1' }));

    expect({
      copiedText: clipboardWrite.mock.calls[0]?.[0],
      feedback: await screen.findByRole('status'),
    }).toEqual({
      copiedText: 'ABCD2345',
      feedback: expect.objectContaining({ textContent: 'Code copied.' }),
    });
  });

  it('revokes a voter credential only after confirmation', async () => {
    await renderConfiguration('Voters');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Revoke Table 1' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke voter' }),
    );

    expect(
      await screen.findByRole('row', { name: /Table 1 ABCD2345 REVOKED/ }),
    ).toBeInTheDocument();
  });

  it('moves a position in the proposed order without applying it', async () => {
    await renderConfiguration('Order');
    const user = userEvent.setup();
    const list = screen.getByRole('list', { name: 'Proposed voting order' });

    await user.click(within(list).getByRole('button', { name: 'Move Treasurer up' }));

    expect({
      proposedOrder: within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('span')?.textContent),
      appliedOrder: appliedQueue,
    }).toEqual({
      proposedOrder: ['Treasurer', 'President'],
      appliedOrder: undefined,
    });
  });

  it('shows a server suggestion separately until the admin confirms applying it', async () => {
    await renderConfiguration('Order');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Suggest order' }));

    expect({
      proposedTitles: within(screen.getByRole('list', { name: 'Proposed voting order' }))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('span')?.textContent),
      appliedOrder: appliedQueue,
    }).toEqual({ proposedTitles: ['Treasurer', 'President'], appliedOrder: undefined });
  });

  it('applies the proposed order only after explicit confirmation', async () => {
    await renderConfiguration('Order');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Suggest order' }));
    await user.click(screen.getByRole('button', { name: 'Apply order' }));

    expect(appliedQueue).toBeUndefined();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply order' }),
    );

    expect(appliedQueue).toEqual(['position-2', 'position-1']);
  });
});
