import type {
  AdminElectionDTO,
  Candidate,
  CreateCandidateBody,
  Position,
  UpdateCandidateBody,
} from '@voto/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { createMockApiServer } from './msw/mock-api-server';
import { createFakeSocket } from './utils/fake-socket';
import { makeAdminElectionDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const ADMIN_TOKEN = 'admin-session-token';
const ADMIN_TOKEN_KEY = 'voto:admin-token';
const ELECTION_ID = 'election-1';
const presidentPosition: Position = {
  id: 'position-1',
  title: 'President',
  tiebreak: 'YOUNGEST',
  status: 'PENDING',
};
const treasurerPosition: Position = {
  id: 'position-2',
  title: 'Treasurer',
  tiebreak: 'OLDEST',
  status: 'PENDING',
};
const existingCandidate: Candidate = {
  id: 'candidate-1',
  name: 'Ana Silva',
  age: 20,
  remainingMonths: 24,
  applications: [presidentPosition.id, treasurerPosition.id],
  firstChoicePositionId: presidentPosition.id,
  createdAt: '2026-01-01T12:00:00.000Z',
};
const mockApi = createMockApiServer();

let electionState: AdminElectionDTO;
let createdCandidateBody: CreateCandidateBody | undefined;
let updatedCandidateBody: UpdateCandidateBody | undefined;

beforeAll(() => {
  mockApi.listen();
});

beforeEach(() => {
  electionState = makeAdminElectionDTO({
    election: {
      ...makeAdminElectionDTO().election,
      id: ELECTION_ID,
      positions: [presidentPosition, treasurerPosition],
      queue: [presidentPosition.id, treasurerPosition.id],
      candidates: [existingCandidate],
    },
  });
  createdCandidateBody = undefined;
  updatedCandidateBody = undefined;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, ADMIN_TOKEN);
  mockApi.use(
    http.get('*/api/admin/me', () => HttpResponse.json({ id: 'admin-1', username: 'admin' })),
    http.get('*/api/elections/:id', () => HttpResponse.json(electionState)),
    http.post('*/api/elections/:id/candidates', async ({ request }) => {
      createdCandidateBody = (await request.json()) as CreateCandidateBody;
      const newCandidate: Candidate = {
        ...createdCandidateBody,
        id: 'candidate-2',
        createdAt: '2026-02-01T12:00:00.000Z',
      };
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          candidates: [...electionState.election.candidates, newCandidate],
        },
      };
      return HttpResponse.json(electionState, { status: 201 });
    }),
    http.patch('*/api/elections/:id/candidates/:candidateId', async ({ request, params }) => {
      updatedCandidateBody = (await request.json()) as UpdateCandidateBody;
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          candidates: electionState.election.candidates.map((candidate) =>
            candidate.id === params.candidateId
              ? { ...candidate, ...updatedCandidateBody }
              : candidate,
          ),
        },
      };
      return HttpResponse.json(electionState);
    }),
    http.delete('*/api/elections/:id/candidates/:candidateId', ({ params }) => {
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          candidates: electionState.election.candidates.filter(
            (candidate) => candidate.id !== params.candidateId,
          ),
        },
      };
      return HttpResponse.json(electionState);
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
 * Renders the protected election configuration route used by candidate scenarios.
 *
 * @returns The rendered application for the election configuration route.
 */
/**
 * Renders the protected election configuration route.
 *
 * @returns The rendered application for candidate configuration.
 */
function renderConfiguration(): void {
  renderWithProviders(<App createSocketClient={() => createFakeSocket()} />, {
    initialEntries: [`/admin/eleicoes/${ELECTION_ID}/configurar`],
  });
}

/**
 * Fills valid candidate fields and marks the President application.
 *
 * @param user - User-event instance for the rendered form.
 * @param age - Candidate age used by the current validation scenario.
 * @returns Promise resolved after all candidate fields are entered.
 */
async function fillNewCandidate(
  user: ReturnType<typeof userEvent.setup>,
  age: number,
): Promise<void> {
  await user.type(screen.getByRole('textbox', { name: 'Candidate name' }), 'Beatriz Costa');
  await user.clear(screen.getByRole('spinbutton', { name: 'Age' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Age' }), String(age));
  await user.clear(screen.getByRole('spinbutton', { name: 'Remaining university time (months)' }));
  await user.type(
    screen.getByRole('spinbutton', { name: 'Remaining university time (months)' }),
    '18',
  );
  await user.click(screen.getByRole('checkbox', { name: 'President' }));
}

describe('administrator candidate configuration', () => {
  it('creates a candidate with an application and first choice', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await fillNewCandidate(user, 22);
    await user.click(screen.getByRole('button', { name: 'Add candidate' }));

    expect({
      body: createdCandidateBody,
      candidate: await screen.findByRole('heading', { name: 'Beatriz Costa' }),
    }).toEqual({
      body: {
        name: 'Beatriz Costa',
        age: 22,
        remainingMonths: 18,
        applications: [presidentPosition.id],
        firstChoicePositionId: presidentPosition.id,
      },
      candidate: expect.any(HTMLElement),
    });
  });

  it.each([
    { age: 15, valid: false },
    { age: 16, valid: true },
    { age: 120, valid: true },
    { age: 121, valid: false },
  ])('validates candidate age $age against domain boundaries', async ({ age, valid }) => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await fillNewCandidate(user, age);
    await user.click(screen.getByRole('button', { name: 'Add candidate' }));

    expect({
      accepted: createdCandidateBody !== undefined,
      validation: screen.queryByRole('alert')?.textContent,
    }).toEqual({
      accepted: valid,
      validation: valid ? undefined : 'Candidate age must be a whole number from 16 to 120.',
    });
  });

  it('requires at least one application before creating a candidate', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await user.type(screen.getByRole('textbox', { name: 'Candidate name' }), 'Beatriz Costa');
    await user.type(screen.getByRole('spinbutton', { name: 'Age' }), '22');
    await user.click(screen.getByRole('button', { name: 'Add candidate' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select at least one position application.',
    );
  });

  it('moves first choice to a remaining application when its application is removed', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await user.type(screen.getByRole('textbox', { name: 'Candidate name' }), 'Beatriz Costa');
    await user.click(screen.getByRole('checkbox', { name: 'President' }));
    await user.click(screen.getByRole('checkbox', { name: 'Treasurer' }));
    await user.click(screen.getByRole('checkbox', { name: 'President' }));

    expect(screen.getByRole('combobox', { name: 'First choice position' })).toHaveValue(
      treasurerPosition.id,
    );
  });

  it('updates candidate first choice to another application', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await user.click(screen.getByRole('button', { name: 'Edit Ana Silva' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'First choice position' }),
      treasurerPosition.id,
    );
    await user.click(screen.getByRole('button', { name: 'Save candidate' }));

    expect({
      firstChoice: updatedCandidateBody?.firstChoicePositionId,
      candidate: await screen.findByText('First choice: Treasurer'),
    }).toEqual({
      firstChoice: treasurerPosition.id,
      candidate: expect.any(HTMLElement),
    });
  });

  it('keeps a candidate when removal confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await user.click(screen.getByRole('button', { name: 'Remove Ana Silva' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { name: 'Ana Silva' })).toBeInTheDocument();
  });

  it('removes a candidate after confirmation using the returned election state', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await user.click(screen.getByRole('button', { name: 'Remove Ana Silva' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove candidate' }),
    );

    expect(await screen.findByText('No candidates have been added.')).toBeInTheDocument();
  });

  it('keeps an elected candidate when the API rejects removal', async () => {
    electionState = {
      ...electionState,
      election: {
        ...electionState.election,
        positions: [
          {
            ...presidentPosition,
            status: 'DECIDED',
            electedCandidateId: existingCandidate.id,
          },
          treasurerPosition,
        ],
      },
    };
    mockApi.use(
      http.delete('*/api/elections/:id/candidates/:candidateId', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CANDIDATE_ALREADY_ELECTED',
              message: 'An elected candidate cannot be removed.',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderConfiguration();

    await user.click(await screen.findByRole('tab', { name: 'Candidates' }));
    await screen.findByRole('heading', { name: 'Candidates' });
    await user.click(screen.getByRole('button', { name: 'Remove Ana Silva' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove candidate' }),
    );

    expect({
      error: await screen.findByRole('alert'),
      candidate: screen.getByRole('heading', { name: 'Ana Silva' }),
      electedLabel: screen.getByText('Elected candidate'),
    }).toEqual({
      error: expect.objectContaining({
        textContent: expect.stringContaining('An elected candidate cannot be removed.'),
      }),
      candidate: expect.any(HTMLElement),
      electedLabel: expect.any(HTMLElement),
    });
  });
});
