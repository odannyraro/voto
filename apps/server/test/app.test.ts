import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError, type DomainErrorCode } from '@voto/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpError } from '../src/http/errors';
import { parse } from '../src/http/validate';
import { openElectionWithVoters, withOpenRound } from './support/election-fixtures';
import { makeTestApp } from './support/make-test-app';

const OK = 200;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;
const UNSUPPORTED_MEDIA_TYPE = 415;
const INTERNAL_SERVER_ERROR = 500;

const THROWING_URL = '/throwing';
const VALIDATING_URL = '/validating';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Monta o app de teste com uma única rota (`GET /throwing`) que lança o valor recebido.
 *
 * @param thrown - O que a rota lança; o teste mostra no próprio *Arrange* qual erro é.
 * @returns O app, ainda não iniciado.
 */
function appThrowing(thrown: unknown): FastifyInstance {
  const built = makeTestApp().app;
  built.get(THROWING_URL, () => {
    throw thrown;
  });
  return built;
}

/**
 * Monta o app de teste com uma única rota (`POST /validating`) que valida o corpo
 * `{ name }` (texto não vazio) com `parse`.
 *
 * @returns O app, ainda não iniciado.
 */
function appValidatingName(): FastifyInstance {
  const built = makeTestApp().app;
  built.post(VALIDATING_URL, (request) =>
    parse(z.object({ name: z.string().min(1) }), request.body),
  );
  return built;
}

describe('GET /api/health', () => {
  it('responds 200 with status ok', async () => {
    app = makeTestApp().app;

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('resuming deadlines when the app starts', () => {
  it('schedules the closing of a round that storage still holds open', async () => {
    // Rodada de 60 s (prazo padrão) aberta antes do reinício: o timer vai para prazo + 1 s.
    const test = makeTestApp();
    app = test.app;
    const openedBeforeRestart = withOpenRound(
      openElectionWithVoters({ id: 'e1', positionIds: ['president'] }),
      { positionId: 'president', roundId: 'round-1', openedAt: new Date('2026-01-01T11:59:30Z') },
    );
    await test.deps.electionRepository.create(openedBeforeRestart);

    await app.ready();

    expect(test.scheduler.pending()).toEqual([
      { key: 'round:e1', at: new Date('2026-01-01T12:00:31Z') },
    ]);
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
    app = appThrowing(new HttpError(FORBIDDEN, 'FORBIDDEN', 'Not your election'));

    const response = await app.inject({ method: 'GET', url: THROWING_URL });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toEqual({ error: { code: 'FORBIDDEN', message: 'Not your election' } });
  });

  it.each<{ code: DomainErrorCode; status: number }>([
    { code: 'ELECTION_NOT_DRAFT', status: CONFLICT },
    { code: 'ROUND_EXPIRED', status: GONE },
    { code: 'POSITION_NOT_FOUND', status: NOT_FOUND },
  ])('maps the domain error $code to $status', async ({ code, status }) => {
    app = appThrowing(new DomainError(code, 'A domain rule was broken'));

    const response = await app.inject({ method: 'GET', url: THROWING_URL });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
  });

  it('turns a Zod validation failure into 400 VALIDATION_ERROR', async () => {
    app = appValidatingName();

    const response = await app.inject({
      method: 'POST',
      url: VALIDATING_URL,
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('names the offending field in the validation message', async () => {
    app = appValidatingName();

    const response = await app.inject({
      method: 'POST',
      url: VALIDATING_URL,
      payload: { name: '' },
    });

    expect(response.json().error.message).toMatch(/^name: /);
  });

  it('reports a body that is not an object without a field name', async () => {
    app = appValidatingName();

    const response = await app.inject({ method: 'POST', url: VALIDATING_URL, payload: [] });

    expect(response.json().error.message).not.toMatch(/^: |^\./);
  });

  it('turns a malformed JSON body into 400 VALIDATION_ERROR', async () => {
    app = appValidatingName();

    const response = await app.inject({
      method: 'POST',
      url: VALIDATING_URL,
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects an empty JSON body through the route schema, as if no body came', async () => {
    app = appValidatingName();
    const withoutBody = await app.inject({ method: 'POST', url: VALIDATING_URL });

    const response = await app.inject({
      method: 'POST',
      url: VALIDATING_URL,
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toEqual(withoutBody.json());
  });

  it('turns an unsupported content type into 415 VALIDATION_ERROR', async () => {
    app = appValidatingName();

    const response = await app.inject({
      method: 'POST',
      url: VALIDATING_URL,
      headers: { 'content-type': 'application/xml' },
      payload: '<name>Ana</name>',
    });

    expect(response.statusCode).toBe(UNSUPPORTED_MEDIA_TYPE);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('hides the internal message of an unexpected error behind 500 INTERNAL_ERROR', async () => {
    app = appThrowing(new Error('connection to database 10.0.0.5 refused'));

    const response = await app.inject({ method: 'GET', url: THROWING_URL });

    expect(response.statusCode).toBe(INTERNAL_SERVER_ERROR);
    expect(response.body).not.toContain('10.0.0.5');
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('treats a thrown value that is not an Error as 500 INTERNAL_ERROR', async () => {
    app = appThrowing('not even an Error object');

    const response = await app.inject({ method: 'GET', url: THROWING_URL });

    expect(response.statusCode).toBe(INTERNAL_SERVER_ERROR);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});
