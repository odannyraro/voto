import type {
  AdminElectionDTO,
  Candidate,
  Election,
  ElectionSummaryDTO,
  ErrorDTO,
  Position,
  Voter,
} from '@voto/shared';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer, type SetupServer } from 'msw/node';

const API_ORIGIN = 'http://localhost';
const ADMIN_TOKEN = 'mock-admin-token';

/** Estado em memória controlado pelos handlers MSW. */
interface MockApiState {
  election: Election;
  votersByCode: Map<string, Voter>;
  adminAuthenticated: boolean;
  voterAuthenticated: boolean;
}

/** Servidor MSW com uma operação explícita de reset para cada teste. */
export interface MockApiServer extends SetupServer {
  reset(): void;
}

/**
 * Cria uma eleição vazia usada como estado inicial do mock.
 *
 * @returns Eleição em RASCUNHO com identificadores estáveis.
 */
function createElection(): Election {
  return {
    id: 'election-1',
    adminId: 'admin-1',
    name: 'Mock Election',
    status: 'DRAFT',
    defaultVotingSeconds: 60,
    positions: [],
    queue: [],
    candidates: [],
    voters: [],
    rounds: [],
    version: 0,
  };
}

/**
 * Cria o estado inicial sem dados vazados entre testes.
 *
 * @returns Estado isolado do mock HTTP.
 */
function createInitialState(): MockApiState {
  return {
    election: createElection(),
    votersByCode: new Map(),
    adminAuthenticated: false,
    voterAuthenticated: false,
  };
}

/**
 * Monta o DTO completo usado pelas mutações administrativas.
 *
 * @param election - Agregado atual da eleição.
 * @returns DTO completo com hora atual e estado da fila.
 */
function toAdminElectionDTO(election: Election): AdminElectionDTO {
  return {
    election,
    next: {
      status: election.queue.length > 0 ? 'READY' : 'NONE_LEFT',
      positionId: election.queue[0],
    },
    canUndo: false,
    serverNow: new Date().toISOString(),
  };
}

/**
 * Cria o resumo usado pela lista de eleições do admin.
 *
 * @param election - Agregado atual da eleição.
 * @returns Linha resumida da lista administrativa.
 */
function toElectionSummary(election: Election): ElectionSummaryDTO {
  return {
    id: election.id,
    name: election.name,
    status: election.status,
    positionCount: election.positions.length,
    voterCount: election.voters.length,
  };
}

/**
 * Cria uma resposta padronizada de erro para o contrato REST.
 *
 * @param code - Código compartilhado da resposta.
 * @param message - Mensagem legível apresentada pela UI.
 * @param status - Status HTTP correspondente ao código.
 * @returns Resposta MSW com corpo `ErrorDTO`.
 */
function errorResponse(code: ErrorDTO['error']['code'], message: string, status: number) {
  const body: ErrorDTO = { error: { code, message } };
  return HttpResponse.json(body as JsonBodyType, { status });
}

/**
 * Verifica se o Authorization contém o token administrativo válido.
 *
 * @param request - Requisição recebida pelo MSW.
 * @returns Verdadeiro somente para o token de mock autenticado.
 */
function isAdminRequest(request: Request): boolean {
  return request.headers.get('Authorization') === `Bearer ${ADMIN_TOKEN}`;
}

/**
 * Cria os handlers MSW que implementam o contrato REST necessário ao frontend.
 *
 * @param initialState - Estado inicial opcional usado pelo mock.
 * @returns Servidor em memória com reset explícito.
 */
export function createMockApiServer(
  initialState: MockApiState = createInitialState(),
): MockApiServer {
  let state = initialState;

  const server = setupServer(
    http.get(`${API_ORIGIN}/api/health`, () =>
      HttpResponse.json({ status: 'ok' }),
    ),
    http.post(`${API_ORIGIN}/api/admin/login`, async ({ request }) => {
      const body = (await request.json()) as { username?: string; password?: string };
      if (body.username !== 'admin' || body.password !== 'password') {
        return errorResponse('INVALID_CREDENTIALS', 'Invalid credentials', 401);
      }
      state.adminAuthenticated = true;
      return HttpResponse.json({ token: ADMIN_TOKEN });
    }),
    http.get(`${API_ORIGIN}/api/admin/me`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      return HttpResponse.json({ id: 'admin-1', username: 'admin' });
    }),
    http.get(`${API_ORIGIN}/api/elections`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      return HttpResponse.json([toElectionSummary(state.election)]);
    }),
    http.post(`${API_ORIGIN}/api/elections`, async ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      const body = (await request.json()) as { name?: string; defaultVotingSeconds?: number };
      if (!body.name?.trim()) {
        return errorResponse('VALIDATION_ERROR', 'Name is required', 400);
      }
      state.election = {
        ...state.election,
        name: body.name.trim(),
        defaultVotingSeconds: body.defaultVotingSeconds ?? 60,
        version: state.election.version + 1,
      };
      return HttpResponse.json(toAdminElectionDTO(state.election), { status: 201 });
    }),
    http.get(`${API_ORIGIN}/api/elections/:id`, ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.patch(`${API_ORIGIN}/api/elections/:id`, async ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      const body = (await request.json()) as { name?: string; defaultVotingSeconds?: number };
      state.election = {
        ...state.election,
        name: body.name?.trim() || state.election.name,
        defaultVotingSeconds:
          body.defaultVotingSeconds ?? state.election.defaultVotingSeconds,
        version: state.election.version + 1,
      };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.post(`${API_ORIGIN}/api/elections/:id/positions`, async ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      const body = (await request.json()) as { title?: string; tiebreak?: Position['tiebreak'] };
      if (!body.title?.trim()) {
        return errorResponse('VALIDATION_ERROR', 'Title is required', 400);
      }
      const position: Position = {
        id: `position-${state.election.positions.length + 1}`,
        title: body.title.trim(),
        tiebreak: body.tiebreak ?? 'YOUNGEST',
        status: 'PENDING',
      };
      state.election = {
        ...state.election,
        positions: [...state.election.positions, position],
        queue: [...state.election.queue, position.id],
      };
      return HttpResponse.json(toAdminElectionDTO(state.election), { status: 201 });
    }),
    http.post(`${API_ORIGIN}/api/elections/:id/candidates`, async ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      const body = (await request.json()) as Omit<Candidate, 'id' | 'createdAt'>;
      const candidate: Candidate = {
        ...body,
        id: `candidate-${state.election.candidates.length + 1}`,
        createdAt: new Date().toISOString(),
      };
      state.election = {
        ...state.election,
        candidates: [...state.election.candidates, candidate],
      };
      return HttpResponse.json(toAdminElectionDTO(state.election), { status: 201 });
    }),
    http.patch(`${API_ORIGIN}/api/elections/:id/positions/:positionId`, async ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      const body = (await request.json()) as { title?: string; tiebreak?: Position['tiebreak'] };
      state.election = {
        ...state.election,
        positions: state.election.positions.map((position) =>
          position.id === params.positionId
            ? {
                ...position,
                title: body.title?.trim() || position.title,
                tiebreak: body.tiebreak ?? position.tiebreak,
              }
            : position,
        ),
      };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.delete(`${API_ORIGIN}/api/elections/:id/positions/:positionId`, ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      state.election = {
        ...state.election,
        positions: state.election.positions.filter((position) => position.id !== params.positionId),
        queue: state.election.queue.filter((positionId) => positionId !== params.positionId),
      };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.patch(`${API_ORIGIN}/api/elections/:id/candidates/:candidateId`, async ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      const body = (await request.json()) as Partial<Candidate>;
      state.election = {
        ...state.election,
        candidates: state.election.candidates.map((candidate) =>
          candidate.id === params.candidateId ? { ...candidate, ...body } : candidate,
        ),
      };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.delete(`${API_ORIGIN}/api/elections/:id/candidates/:candidateId`, ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      state.election = {
        ...state.election,
        candidates: state.election.candidates.filter(
          (candidate) => candidate.id !== params.candidateId,
        ),
      };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.post(
      `${API_ORIGIN}/api/elections/:id/positions/:positionId/candidates/:candidateId`,
      ({ request }) => {
        if (!isAdminRequest(request) || !state.adminAuthenticated) {
          return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
        }
        return HttpResponse.json(toAdminElectionDTO(state.election));
      },
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/voters`, async ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      const body = (await request.json()) as { count: number; labels?: string[] };
      if (!Number.isInteger(body.count) || body.count < 1 || body.count > 500) {
        return errorResponse('VALIDATION_ERROR', 'Invalid voter count', 400);
      }
      const generated: string[] = [];
      for (let index = 0; index < body.count; index += 1) {
        const code = `MOCK${String(index + 1).padStart(4, '0')}`;
        const voter: Voter = {
          id: `voter-${state.election.voters.length + index + 1}`,
          code,
          label: body.labels?.[index],
          status: 'CREDENTIALED',
        };
        state.votersByCode.set(code, voter);
        generated.push(code);
      }
      state.election = {
        ...state.election,
        voters: [...state.election.voters, ...Array.from(state.votersByCode.values())],
      };
      return HttpResponse.json({
        codes: generated,
        election: toAdminElectionDTO(state.election),
      }, { status: 201 });
    }),
    http.delete(`${API_ORIGIN}/api/elections/:id/voters/:voterId`, ({ request, params }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      if (params.id !== state.election.id) {
        return errorResponse('ELECTION_NOT_FOUND', 'Election not found', 404);
      }
      state.election = {
        ...state.election,
        voters: state.election.voters.map((voter) =>
          voter.id === params.voterId ? { ...voter, status: 'REVOKED' } : voter,
        ),
      };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.post(`${API_ORIGIN}/api/voter/session`, async ({ request }) => {
      const body = (await request.json()) as { code?: string };
      if (!body.code || !state.votersByCode.has(body.code)) {
        return errorResponse('INVALID_CODE', 'Invalid voter code', 404);
      }
      state.voterAuthenticated = true;
      return HttpResponse.json({
        token: 'mock-voter-token',
        electionId: state.election.id,
        electionName: state.election.name,
      });
    }),
    http.get(`${API_ORIGIN}/api/voter/state`, () => {
      if (!state.voterAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      return HttpResponse.json({
        phase: 'WAITING',
        electionName: state.election.name,
        serverNow: new Date().toISOString(),
      });
    }),
    http.post(`${API_ORIGIN}/api/voter/votes`, () =>
      errorResponse('ROUND_NOT_OPEN', 'No round is open', 409),
    ),
    http.put(`${API_ORIGIN}/api/elections/:id/queue`, () =>
      HttpResponse.json(toAdminElectionDTO(state.election)),
    ),
    http.get(`${API_ORIGIN}/api/elections/:id/queue/suggestion`, () =>
      HttpResponse.json({ positionIds: state.election.queue }),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/rounds`, () =>
      HttpResponse.json(toAdminElectionDTO(state.election), { status: 201 }),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/open`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      state.election = { ...state.election, status: 'OPEN' };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.get(`${API_ORIGIN}/api/elections/:id/next`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      return HttpResponse.json(toAdminElectionDTO(state.election).next);
    }),
    http.post(`${API_ORIGIN}/api/elections/:id/rounds/:roundId/close`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
    http.post(`${API_ORIGIN}/api/elections/:id/positions/:positionId/runoff`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      return HttpResponse.json(toAdminElectionDTO(state.election), { status: 201 });
    }),
    http.post(`${API_ORIGIN}/api/elections/:id/positions/:positionId/defer`, ({ request }) =>
      isAdminRequest(request)
        ? HttpResponse.json(toAdminElectionDTO(state.election))
        : errorResponse('INVALID_TOKEN', 'Invalid token', 401),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/positions/:positionId/cancel`, ({ request }) =>
      isAdminRequest(request)
        ? HttpResponse.json(toAdminElectionDTO(state.election))
        : errorResponse('INVALID_TOKEN', 'Invalid token', 401),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/rounds/:roundId/release`, ({ request }) =>
      isAdminRequest(request)
        ? HttpResponse.json(toAdminElectionDTO(state.election))
        : errorResponse('INVALID_TOKEN', 'Invalid token', 401),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/rounds/:roundId/annul`, ({ request }) =>
      isAdminRequest(request)
        ? HttpResponse.json(toAdminElectionDTO(state.election))
        : errorResponse('INVALID_TOKEN', 'Invalid token', 401),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/undo`, ({ request }) =>
      isAdminRequest(request)
        ? HttpResponse.json(toAdminElectionDTO(state.election))
        : errorResponse('INVALID_TOKEN', 'Invalid token', 401),
    ),
    http.post(`${API_ORIGIN}/api/elections/:id/finish`, ({ request }) => {
      if (!isAdminRequest(request) || !state.adminAuthenticated) {
        return errorResponse('INVALID_TOKEN', 'Invalid token', 401);
      }
      state.election = { ...state.election, status: 'FINISHED' };
      return HttpResponse.json(toAdminElectionDTO(state.election));
    }),
  );

  const mockApi = server as MockApiServer;
  mockApi.reset = (): void => {
    state = createInitialState();
    server.resetHandlers();
  };
  return mockApi;
}
