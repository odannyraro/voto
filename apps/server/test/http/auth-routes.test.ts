import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestApp } from '../support/make-test-app';

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const ADMIN_ID = 'admin-ana';

/** App com o admin 'ana' (senha 's3cret') já cadastrado. */
async function appWithAdminAna() {
  const test = makeTestApp();
  app = test.app;
  await test.deps.adminRepository.create({
    id: ADMIN_ID,
    username: 'ana',
    passwordHash: await test.auth.hashPassword('s3cret'),
  });
  return { ...test, adminId: ADMIN_ID };
}

describe('POST /api/admin/login', () => {
  it('returns a verifiable admin token for the right credentials', async () => {
    const { app, auth, adminId } = await appWithAdminAna();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { username: 'ana', password: 's3cret' },
    });

    expect(response.statusCode).toBe(OK);
    expect(await auth.verifyToken(response.json<{ token: string }>().token)).toEqual({
      role: 'admin',
      adminId,
    });
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const { app } = await appWithAdminAna();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { username: 'ana', password: 'wrong' },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('rejects a body without username with 400 VALIDATION_ERROR', async () => {
    const { app } = await appWithAdminAna();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 's3cret' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('GET /api/admin/me', () => {
  it('returns the id and username of the logged admin, without the password hash', async () => {
    const { app, auth, adminId } = await appWithAdminAna();
    const token = await auth.issueAdminToken(adminId);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toEqual({ id: adminId, username: 'ana' });
  });

  it('rejects a request without token with 401 INVALID_TOKEN', async () => {
    const { app } = await appWithAdminAna();

    const response = await app.inject({ method: 'GET', url: '/api/admin/me' });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('rejects a voter token with 403 FORBIDDEN', async () => {
    const { app, auth } = await appWithAdminAna();
    const token = await auth.issueVoterToken({ electionId: 'e1', voterId: 'e1:ABCD2345' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('rejects the token of an admin that no longer exists with 401 INVALID_TOKEN', async () => {
    const { app, auth } = await appWithAdminAna();
    const token = await auth.issueAdminToken('removed-admin');

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });
});
