import type { ErrorDTO } from '@voto/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createMockApiServer } from './mock-api-server';
import { createTestFaker } from '../utils/faker';

const mockApi = createMockApiServer();

describe('createMockApiServer', () => {
  beforeAll(() => {
    mockApi.listen();
  });

  afterEach(() => {
    mockApi.reset();
  });

  afterAll(() => {
    mockApi.close();
  });

  it('returns the health state for a successful request', async () => {
    const response = await fetch('http://localhost/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('returns an invalid code error for an unknown voter session', async () => {
    const response = await fetch('http://localhost/api/voter/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'NOTFOUND1' }),
    });
    const body = (await response.json()) as ErrorDTO;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('INVALID_CODE');
  });

  it('rejects invalid admin credentials', async () => {
    const response = await fetch('http://localhost/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });

    expect(response.status).toBe(401);
  });

  it('uses deterministic Brazilian Portuguese data in the initial election', async () => {
    const loginResponse = await fetch('http://localhost/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    const login = (await loginResponse.json()) as { token: string };
    const response = await fetch('http://localhost/api/elections', {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    const elections = (await response.json()) as Array<{ name: string }>;

    expect(elections[0]?.name).toBe(createTestFaker().company.name());
  });

  it('creates and lists an election for an authenticated admin', async () => {
    const loginResponse = await fetch('http://localhost/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    const login = (await loginResponse.json()) as { token: string };

    const createResponse = await fetch('http://localhost/api/elections', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${login.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Student Election', defaultVotingSeconds: 60 }),
    });

    expect(createResponse.status).toBe(201);

    const listResponse = await fetch('http://localhost/api/elections', {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    const elections = (await listResponse.json()) as Array<{ name: string }>;

    expect(elections).toEqual([expect.objectContaining({ name: 'Student Election' })]);
  });
});
