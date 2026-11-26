import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRequest, ApiError } from '../src/api/api-client';
import { createMockApiServer } from './msw/mock-api-server';

const API_ORIGIN = 'http://localhost:3000';
const mockApi = createMockApiServer();

describe('apiRequest', () => {
  beforeAll(() => {
    mockApi.listen();
  });

  afterEach(() => {
    mockApi.reset();
  });

  afterAll(() => {
    mockApi.close();
  });

  it('sends the Bearer token to the prefixed API endpoint', async () => {
    mockApi.use(
      http.get(`${API_ORIGIN}/api/public`, ({ request }) =>
        HttpResponse.json({
          path: new URL(request.url).pathname,
          authorization: request.headers.get('Authorization'),
        }),
      ),
    );

    const response = await apiRequest<{
      path: string;
      authorization: string | null;
    }>('/public', { token: 'admin-token' });

    expect(response).toEqual({
      path: '/api/public',
      authorization: 'Bearer admin-token',
    });
  });

  it('serializes a request body as JSON', async () => {
    let receivedRequest: { contentType: string | null; body: unknown } | undefined;
    mockApi.use(
      http.post(`${API_ORIGIN}/api/elections`, async ({ request }) => {
        receivedRequest = {
          contentType: request.headers.get('Content-Type'),
          body: await request.json(),
        };
        return HttpResponse.json({ created: true });
      }),
    );

    await apiRequest('/elections', {
      method: 'POST',
      body: { name: 'Student Election', defaultVotingSeconds: 60 },
    });

    expect(receivedRequest).toEqual({
      contentType: 'application/json',
      body: { name: 'Student Election', defaultVotingSeconds: 60 },
    });
  });

  it('throws an ApiError containing a valid ErrorDTO', async () => {
    mockApi.use(
      http.post(`${API_ORIGIN}/api/undo`, () =>
        HttpResponse.json(
          { error: { code: 'NOTHING_TO_UNDO', message: 'There is nothing to undo.' } },
          { status: 409 },
        ),
      ),
    );

    await expect(apiRequest('/undo', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      error: { code: 'NOTHING_TO_UNDO', message: 'There is nothing to undo.' },
      message: 'There is nothing to undo.',
    });
  });

  it('returns undefined for a successful response without a body', async () => {
    mockApi.use(
      http.post(`${API_ORIGIN}/api/votes`, () => new HttpResponse(null, { status: 204 })),
    );

    await expect(apiRequest('/votes', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('throws a controlled ApiError when an error response is not JSON', async () => {
    mockApi.use(
      http.get(
        `${API_ORIGIN}/api/unavailable`,
        () => new HttpResponse('Service unavailable', { status: 503 }),
      ),
    );

    await expect(apiRequest('/unavailable')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      error: undefined,
    });
  });

  it('throws a controlled ApiError when a successful response is not JSON', async () => {
    mockApi.use(
      http.get(`${API_ORIGIN}/api/plain-text`, () => new HttpResponse('not JSON', { status: 200 })),
    );

    await expect(apiRequest('/plain-text')).rejects.toBeInstanceOf(ApiError);
  });
});
