import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { adminApi } from '../src/api/admin-api';
import { publicApi } from '../src/api/public-api';
import { voterApi } from '../src/api/voter-api';
import { createMockApiServer } from './msw/mock-api-server';

const API_ORIGIN = 'http://localhost:3000';
const ADMIN_TOKEN = 'admin-token';
const ELECTION_ID = 'election-1';
const mockApi = createMockApiServer();

interface ApiCall {
  readonly name: string;
  readonly invoke: () => Promise<unknown>;
  readonly method: string;
  readonly path: string;
  readonly authorization?: string;
  readonly body?: unknown;
}

const createElectionBody = { name: 'Student Election', defaultVotingSeconds: 60 };
const createPositionBody = { title: 'President', tiebreak: 'YOUNGEST' as const };
const createCandidateBody = {
  name: 'Ana',
  age: 20,
  remainingMonths: 24,
  applications: ['position-1'],
  firstChoicePositionId: 'position-1',
};
const apiCalls: readonly ApiCall[] = [
  {
    name: 'administrator login',
    invoke: () => adminApi.login({ username: 'admin', password: 'secret' }),
    method: 'POST',
    path: '/api/admin/login',
    body: { username: 'admin', password: 'secret' },
  },
  {
    name: 'administrator identity',
    invoke: () => adminApi.getMe(ADMIN_TOKEN),
    method: 'GET',
    path: '/api/admin/me',
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'administrator election list',
    invoke: () => adminApi.listElections(ADMIN_TOKEN),
    method: 'GET',
    path: '/api/elections',
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'election creation',
    invoke: () => adminApi.createElection(ADMIN_TOKEN, createElectionBody),
    method: 'POST',
    path: '/api/elections',
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: createElectionBody,
  },
  {
    name: 'election retrieval',
    invoke: () => adminApi.getElection(ADMIN_TOKEN, ELECTION_ID),
    method: 'GET',
    path: `/api/elections/${ELECTION_ID}`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'election update',
    invoke: () => adminApi.updateElection(ADMIN_TOKEN, ELECTION_ID, { name: 'Updated Election' }),
    method: 'PATCH',
    path: `/api/elections/${ELECTION_ID}`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { name: 'Updated Election' },
  },
  {
    name: 'position creation',
    invoke: () => adminApi.createPosition(ADMIN_TOKEN, ELECTION_ID, createPositionBody),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/positions`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: createPositionBody,
  },
  {
    name: 'position update',
    invoke: () =>
      adminApi.updatePosition({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        positionId: 'position-1',
        body: { title: 'Vice President' },
      }),
    method: 'PATCH',
    path: `/api/elections/${ELECTION_ID}/positions/position-1`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { title: 'Vice President' },
  },
  {
    name: 'position deletion',
    invoke: () =>
      adminApi.deletePosition({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        positionId: 'position-1',
      }),
    method: 'DELETE',
    path: `/api/elections/${ELECTION_ID}/positions/position-1`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'queue update',
    invoke: () => adminApi.updateQueue(ADMIN_TOKEN, ELECTION_ID, { positionIds: ['position-1'] }),
    method: 'PUT',
    path: `/api/elections/${ELECTION_ID}/queue`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { positionIds: ['position-1'] },
  },
  {
    name: 'queue suggestion',
    invoke: () => adminApi.getQueueSuggestion(ADMIN_TOKEN, ELECTION_ID),
    method: 'GET',
    path: `/api/elections/${ELECTION_ID}/queue/suggestion`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'candidate creation',
    invoke: () => adminApi.createCandidate(ADMIN_TOKEN, ELECTION_ID, createCandidateBody),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/candidates`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: createCandidateBody,
  },
  {
    name: 'candidate update',
    invoke: () =>
      adminApi.updateCandidate({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        candidateId: 'candidate-1',
        body: { name: 'Ana Silva' },
      }),
    method: 'PATCH',
    path: `/api/elections/${ELECTION_ID}/candidates/candidate-1`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { name: 'Ana Silva' },
  },
  {
    name: 'candidate deletion',
    invoke: () =>
      adminApi.deleteCandidate({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        candidateId: 'candidate-1',
      }),
    method: 'DELETE',
    path: `/api/elections/${ELECTION_ID}/candidates/candidate-1`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'candidate attachment',
    invoke: () =>
      adminApi.attachCandidate({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        positionId: 'position-1',
        candidateId: 'candidate-1',
      }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/positions/position-1/candidates/candidate-1`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'voter credential generation',
    invoke: () =>
      adminApi.credentialVoters(ADMIN_TOKEN, ELECTION_ID, {
        count: 2,
        labels: ['Desk 1', 'Desk 2'],
      }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/voters`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { count: 2, labels: ['Desk 1', 'Desk 2'] },
  },
  {
    name: 'voter credential revocation',
    invoke: () =>
      adminApi.revokeVoter({ token: ADMIN_TOKEN, electionId: ELECTION_ID, voterId: 'voter-1' }),
    method: 'DELETE',
    path: `/api/elections/${ELECTION_ID}/voters/voter-1`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'election opening',
    invoke: () => adminApi.openElection(ADMIN_TOKEN, ELECTION_ID),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/open`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'next position retrieval',
    invoke: () => adminApi.getNextPosition(ADMIN_TOKEN, ELECTION_ID),
    method: 'GET',
    path: `/api/elections/${ELECTION_ID}/next`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'position deferral',
    invoke: () =>
      adminApi.deferPosition({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        positionId: 'position-1',
      }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/positions/position-1/defer`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'position cancellation',
    invoke: () =>
      adminApi.cancelPosition({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        positionId: 'position-1',
        body: { confirmTitle: 'President' },
      }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/positions/position-1/cancel`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { confirmTitle: 'President' },
  },
  {
    name: 'first round opening',
    invoke: () =>
      adminApi.openRound(ADMIN_TOKEN, ELECTION_ID, {
        positionId: 'position-1',
        durationSeconds: 60,
      }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/rounds`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { positionId: 'position-1', durationSeconds: 60 },
  },
  {
    name: 'round closing',
    invoke: () =>
      adminApi.closeRound({ token: ADMIN_TOKEN, electionId: ELECTION_ID, roundId: 'round-1' }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/rounds/round-1/close`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'runoff opening',
    invoke: () =>
      adminApi.openRunoff({
        token: ADMIN_TOKEN,
        electionId: ELECTION_ID,
        positionId: 'position-1',
        body: { durationSeconds: 90 },
      }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/positions/position-1/runoff`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
    body: { durationSeconds: 90 },
  },
  {
    name: 'result release',
    invoke: () =>
      adminApi.releaseRound({ token: ADMIN_TOKEN, electionId: ELECTION_ID, roundId: 'round-1' }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/rounds/round-1/release`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'round annulment',
    invoke: () =>
      adminApi.annulRound({ token: ADMIN_TOKEN, electionId: ELECTION_ID, roundId: 'round-1' }),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/rounds/round-1/annul`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'election undo',
    invoke: () => adminApi.undoElection(ADMIN_TOKEN, ELECTION_ID),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/undo`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'election finish',
    invoke: () => adminApi.finishElection(ADMIN_TOKEN, ELECTION_ID),
    method: 'POST',
    path: `/api/elections/${ELECTION_ID}/finish`,
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  {
    name: 'voter session creation',
    invoke: () => voterApi.createSession({ code: 'ABCD1234' }),
    method: 'POST',
    path: '/api/voter/session',
    body: { code: 'ABCD1234' },
  },
  {
    name: 'voter state retrieval',
    invoke: () => voterApi.getState('voter-token'),
    method: 'GET',
    path: '/api/voter/state',
    authorization: 'Bearer voter-token',
  },
  {
    name: 'vote submission',
    invoke: () => voterApi.castVote('voter-token', { roundId: 'round-1', choice: 'candidate-1' }),
    method: 'POST',
    path: '/api/voter/votes',
    authorization: 'Bearer voter-token',
    body: { roundId: 'round-1', choice: 'candidate-1' },
  },
  {
    name: 'public health check',
    invoke: () => publicApi.getHealth(),
    method: 'GET',
    path: '/api/health',
  },
];

describe('REST API methods', () => {
  beforeAll(() => {
    mockApi.listen();
  });

  afterEach(() => {
    mockApi.reset();
  });

  afterAll(() => {
    mockApi.close();
  });

  it.each(apiCalls)('$name uses its documented route and request data', async (apiCall) => {
    let receivedRequest:
      | {
          readonly method: string;
          readonly path: string;
          readonly authorization: string | null;
          readonly body: unknown;
        }
      | undefined;
    mockApi.use(
      http.all(`${API_ORIGIN}/api/*`, async ({ request }) => {
        const requestBody = await request.text();
        receivedRequest = {
          method: request.method,
          path: new URL(request.url).pathname,
          authorization: request.headers.get('Authorization'),
          body: requestBody === '' ? undefined : (JSON.parse(requestBody) as unknown),
        };
        return apiCall.path === '/api/voter/votes'
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ accepted: true });
      }),
    );

    await apiCall.invoke();

    expect(receivedRequest).toEqual({
      method: apiCall.method,
      path: apiCall.path,
      authorization: apiCall.authorization ?? null,
      body: apiCall.body,
    });
  });

  it('encodes resource identifiers as individual path segments', async () => {
    let receivedPath: string | undefined;
    mockApi.use(
      http.all(`${API_ORIGIN}/api/*`, ({ request }) => {
        receivedPath = new URL(request.url).pathname;
        return HttpResponse.json({ accepted: true });
      }),
    );

    await adminApi.getElection(ADMIN_TOKEN, 'election/one');

    expect(receivedPath).toBe('/api/elections/election%2Fone');
  });

  it('rejects a bodyless success response for endpoints that require a DTO', async () => {
    mockApi.use(
      http.get(`${API_ORIGIN}/api/elections`, () => new HttpResponse(null, { status: 204 })),
    );

    await expect(adminApi.listElections(ADMIN_TOKEN)).rejects.toMatchObject({
      name: 'ApiError',
      status: 204,
      message: 'Expected a JSON response body but received HTTP 204.',
    });
  });
});
