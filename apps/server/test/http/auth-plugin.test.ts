import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { getAdminId, registerAuth } from '../../src/http/auth-plugin';
import { registerErrorHandling } from '../../src/http/error-handler';
import { makeTestApp } from '../support/make-test-app';

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const INTERNAL_SERVER_ERROR = 500;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Monta um Fastify mínimo com uma rota por papel e uma rota que esqueceu o preHandler.
 *
 * @returns O app (também guardado em `app`, para o `afterEach` fechar) e o serviço de auth
 *   que emite os tokens aceitos por ele.
 */
function appWithGuardedRoutes() {
  const { auth } = makeTestApp();
  app = Fastify();
  registerErrorHandling(app);
  const { requireAdmin, requireVoter } = registerAuth(app, auth);
  app.get('/admin-only', { preHandler: requireAdmin }, (request) => ({
    adminId: getAdminId(request),
  }));
  app.get('/voter-only', { preHandler: requireVoter }, (request) => ({ auth: request.auth }));
  app.get('/unguarded', (request) => ({ adminId: getAdminId(request) }));
  return { app, auth };
}

describe('requireAdmin', () => {
  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic YW5hOnMzY3JldA=='],
    ['a Bearer scheme without token', 'Bearer '],
    ['a garbage token', 'Bearer not-a-jwt'],
  ])('rejects %s with 401 INVALID_TOKEN', async (_scenario, authorization) => {
    const { app } = appWithGuardedRoutes();

    const response = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: authorization === undefined ? {} : { authorization },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('lets an admin token through and exposes its id to the handler', async () => {
    const { app, auth } = appWithGuardedRoutes();
    const token = await auth.issueAdminToken('admin-7');

    const response = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toEqual({ adminId: 'admin-7' });
  });
});

describe('requireVoter', () => {
  it('lets a voter token through and exposes its claims in request.auth', async () => {
    const { app, auth } = appWithGuardedRoutes();
    const token = await auth.issueVoterToken({ electionId: 'e1', voterId: 'e1:ABCD2345' });

    const response = await app.inject({
      method: 'GET',
      url: '/voter-only',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toEqual({
      auth: { role: 'voter', electionId: 'e1', voterId: 'e1:ABCD2345' },
    });
  });

  it('rejects an admin token with 403 FORBIDDEN', async () => {
    const { app, auth } = appWithGuardedRoutes();
    const token = await auth.issueAdminToken('admin-7');

    const response = await app.inject({
      method: 'GET',
      url: '/voter-only',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('getAdminId', () => {
  it('fails with 500 when the route forgot the requireAdmin preHandler', async () => {
    const { app } = appWithGuardedRoutes();

    const response = await app.inject({ method: 'GET', url: '/unguarded' });

    expect(response.statusCode).toBe(INTERNAL_SERVER_ERROR);
  });
});
