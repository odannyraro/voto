import type {
  AdminElectionDTO,
  CreatePositionBody,
  Position,
  UpdatePositionBody,
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
const existingPosition: Position = {
  id: 'position-1',
  title: 'President',
  tiebreak: 'YOUNGEST',
  status: 'PENDING',
};
const mockApi = createMockApiServer();

let electionState: AdminElectionDTO;
let createdPositionBody: CreatePositionBody | undefined;
let updatedPositionBody: UpdatePositionBody | undefined;

beforeAll(() => {
  mockApi.listen();
});

beforeEach(() => {
  electionState = makeAdminElectionDTO({
    election: {
      ...makeAdminElectionDTO().election,
      id: ELECTION_ID,
      positions: [existingPosition],
      queue: [existingPosition.id],
    },
  });
  createdPositionBody = undefined;
  updatedPositionBody = undefined;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, ADMIN_TOKEN);
  mockApi.use(
    http.get('*/api/admin/me', () => HttpResponse.json({ id: 'admin-1', username: 'admin' })),
    http.get('*/api/elections/:id', () => HttpResponse.json(electionState)),
    http.post('*/api/elections/:id/positions', async ({ request }) => {
      createdPositionBody = (await request.json()) as CreatePositionBody;
      const position: Position = {
        id: 'position-2',
        ...createdPositionBody,
        status: 'PENDING',
      };
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          positions: [...electionState.election.positions, position],
          queue: [...electionState.election.queue, position.id],
        },
      };
      return HttpResponse.json(electionState, { status: 201 });
    }),
    http.patch('*/api/elections/:id/positions/:positionId', async ({ request, params }) => {
      updatedPositionBody = (await request.json()) as UpdatePositionBody;
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          positions: electionState.election.positions.map((position) =>
            position.id === params.positionId ? { ...position, ...updatedPositionBody } : position,
          ),
        },
      };
      return HttpResponse.json(electionState);
    }),
    http.delete('*/api/elections/:id/positions/:positionId', ({ params }) => {
      const positionId = String(params.positionId);
      electionState = {
        ...electionState,
        election: {
          ...electionState.election,
          positions: electionState.election.positions.filter(({ id }) => id !== positionId),
          queue: electionState.election.queue.filter((id) => id !== positionId),
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

function renderConfiguration(): void {
  renderWithProviders(<App createSocketClient={() => createFakeSocket()} />, {
    initialEntries: [`/admin/eleicoes/${ELECTION_ID}/configurar`],
  });
}

describe('administrator position configuration', () => {
  it('creates a new position at the end of the election queue', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await screen.findByRole('heading', { name: 'Cargos' });
    await user.type(screen.getByRole('textbox', { name: 'Nome do cargo' }), 'Treasurer');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Regra de desempate' }),
      'OLDEST',
    );
    await user.click(screen.getByRole('button', { name: 'Adicionar cargo' }));

    const positions = await screen.findByRole('list', { name: 'Cargos da eleição' });
    expect({
      body: createdPositionBody,
      titles: within(positions)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    }).toEqual({
      body: { title: 'Treasurer', tiebreak: 'OLDEST' },
      titles: ['President', 'Treasurer'],
    });
  });

  it('does not create a position with an empty title', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await screen.findByRole('heading', { name: 'Cargos' });
    await user.click(screen.getByRole('button', { name: 'Adicionar cargo' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome do cargo.');
  });

  it('updates a position title and tie-break rule from the returned election state', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await screen.findByRole('heading', { name: 'Cargos' });
    await user.click(screen.getByRole('button', { name: 'Editar President' }));
    await user.clear(screen.getByRole('textbox', { name: 'Nome do cargo' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome do cargo' }), 'Chair');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Regra de desempate' }),
      'MOST_REMAINING_TIME',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar cargo' }));

    expect({
      body: updatedPositionBody,
      title: await screen.findByRole('heading', { name: 'Chair' }),
    }).toEqual({
      body: { title: 'Chair', tiebreak: 'MOST_REMAINING_TIME' },
      title: expect.any(HTMLElement),
    });
  });

  it('keeps a position when its removal confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await screen.findByRole('heading', { name: 'Cargos' });
    await user.click(screen.getByRole('button', { name: 'Remover President' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Voltar' }));

    expect(screen.getByRole('heading', { name: 'President' })).toBeInTheDocument();
  });

  it('removes a position after confirming and displays the returned election state', async () => {
    const user = userEvent.setup();
    renderConfiguration();

    await screen.findByRole('heading', { name: 'Cargos' });
    await user.click(screen.getByRole('button', { name: 'Remover President' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover cargo' }),
    );

    expect(await screen.findByText('Nenhum cargo foi adicionado.')).toBeInTheDocument();
  });

  it('keeps the position and reports the API error when deletion is not allowed', async () => {
    mockApi.use(
      http.delete('*/api/elections/:id/positions/:positionId', () =>
        HttpResponse.json(
          { error: { code: 'ELECTION_NOT_DRAFT', message: 'Election is not in draft.' } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderConfiguration();

    await screen.findByRole('heading', { name: 'Cargos' });
    await user.click(screen.getByRole('button', { name: 'Remover President' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover cargo' }),
    );

    expect({
      error: await screen.findByRole('alert'),
      position: screen.getByRole('heading', { name: 'President' }),
    }).toEqual({
      error: expect.objectContaining({
        textContent: expect.stringContaining(
          'Esta ação só está disponível antes de abrir a eleição.',
        ),
      }),
      position: expect.any(HTMLElement),
    });
  });
});
