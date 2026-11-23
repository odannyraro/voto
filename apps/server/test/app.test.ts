import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from '@voto/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpError } from '../src/http/errors';
import { parse } from '../src/http/validate';
import { makeTestApp } from './support/make-test-app';

const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;
const UNSUPPORTED_MEDIA_TYPE = 415;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** App de teste com rotas que falham de propósito, uma por tipo de erro. */
function appWithFailingRoutes(): FastifyInstance {
  const built = makeTestApp().app;
  built.get('/boom/http', () => {
    throw new HttpError(403, 'FORBIDDEN', 'Not your election');
  });
  built.get('/boom/domain-conflict', () => {
    throw new DomainError('ELECTION_NOT_DRAFT', 'Election already started');
  });
  built.get('/boom/domain-gone', () => {
    throw new DomainError('ROUND_EXPIRED', 'Round is over');
  });
  built.get('/boom/domain-missing', () => {
    throw new DomainError('POSITION_NOT_FOUND', 'No such position');
  });
  built.post('/boom/validation', (request) =>
    parse(z.object({ name: z.string().min(1) }), request.body),
  );
  built.get('/boom/unknown', () => {
    throw new Error('connection to database 10.0.0.5 refused');
  });
  built.get('/boom/non-error', () => {
    throw 'not even an Error object';
  });
  return built;
}

describe('GET /api/health', () => {
  it('responds 200 with status ok', async () => {
    app = makeTestApp().app;

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('answer 404 with an ErrorDTO body', async () => {
    app = makeTestApp().app;

    const response = await app.inject({ method: 'GET', url: '/api/nowhere' });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('error handling', () => {
  it('turns an HttpError into its own status and code', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({ method: 'GET', url: '/boom/http' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: 'FORBIDDEN', message: 'Not your election' } });
  });

  it.each([
    { url: '/boom/domain-conflict', status: CONFLICT, code: 'ELECTION_NOT_DRAFT' },
    { url: '/boom/domain-gone', status: GONE, code: 'ROUND_EXPIRED' },
    { url: '/boom/domain-missing', status: NOT_FOUND, code: 'POSITION_NOT_FOUND' },
  ])('maps the domain error behind $url to $status $code', async ({ url, status, code }) => {
    app = appWithFailingRoutes();

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
  });

  it('turns a Zod validation failure into 400 VALIDATION_ERROR', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/boom/validation',
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('names the offending field in the validation message', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/boom/validation',
      payload: { name: '' },
    });

    expect(response.json().error.message).toMatch(/^name: /);
  });

  it('reports a body that is not an object without a field name', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({ method: 'POST', url: '/boom/validation', payload: [] });

    expect(response.json().error.message).not.toMatch(/^: |^\./);
  });

  it('turns a malformed JSON body into 400 VALIDATION_ERROR', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/boom/validation',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('turns an unsupported content type into 415 VALIDATION_ERROR', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/boom/validation',
      headers: { 'content-type': 'application/xml' },
      payload: '<name>Ana</name>',
    });

    expect(response.statusCode).toBe(UNSUPPORTED_MEDIA_TYPE);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('hides the internal message of an unexpected error behind 500 INTERNAL_ERROR', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({ method: 'GET', url: '/boom/unknown' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('10.0.0.5');
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('treats a thrown value that is not an Error as 500 INTERNAL_ERROR', async () => {
    app = appWithFailingRoutes();

    const response = await app.inject({ method: 'GET', url: '/boom/non-error' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});
