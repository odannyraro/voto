import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { makeTestApp } from '../support/make-test-app';

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;

// Política da §8.4: o admin é uma pessoa só; os eleitores podem entrar todos do mesmo IP (NAT da sala).
const LOGIN_ATTEMPTS_PER_MINUTE = 10;
const VOTER_SESSION_ATTEMPTS_PER_MINUTE = 60;
const ONE_MINUTE_MS = 60_000;

const ANOTHER_IP = '10.0.0.7';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Monta o app de teste sem admins nem eleições: todo login dá 401 e todo código dá 404,
 * o que basta para contar tentativas.
 *
 * @returns O app e o relógio falso.
 */
function emptyApp() {
  const test = makeTestApp();
  app = test.app;
  return test;
}

/** Tentativa de login com credenciais erradas. */
const wrongLogin: InjectOptions = {
  method: 'POST',
  url: '/api/admin/login',
  payload: { username: 'ana', password: 'wrong' },
};

/** Tentativa de entrada de eleitor com um código que não existe. */
const unknownCode: InjectOptions = {
  method: 'POST',
  url: '/api/voter/session',
  payload: { code: 'ABCD2345' },
};

/**
 * Faz a mesma requisição várias vezes, em sequência.
 *
 * @param target - App que recebe as requisições.
 * @param request - Requisição repetida.
 * @param times - Quantas vezes.
 * @returns Os status das respostas, na ordem.
 */
async function repeat(target: FastifyInstance, request: InjectOptions, times: number) {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    statuses.push((await target.inject(request)).statusCode);
  }
  return statuses;
}

describe('rate limit on POST /api/admin/login', () => {
  it('lets the first attempts of the minute reach the route', async () => {
    const { app } = emptyApp();

    const statuses = await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE);

    expect(statuses).toEqual(Array(LOGIN_ATTEMPTS_PER_MINUTE).fill(UNAUTHORIZED));
  });

  it('answers the next attempt with 429 RATE_LIMITED and when to retry', async () => {
    const { app } = emptyApp();
    await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE);

    const response = await app.inject(wrongLogin);

    expect(response.statusCode).toBe(TOO_MANY_REQUESTS);
    expect(response.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.any(String) },
    });
    expect(response.headers['retry-after']).toBe('60');
  });

  it('counts the attempts of each client address separately', async () => {
    const { app } = emptyApp();
    await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE);

    const response = await app.inject({ ...wrongLogin, remoteAddress: ANOTHER_IP });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it('accepts attempts again once the minute is over', async () => {
    const { app, clock } = emptyApp();
    await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE);
    clock.advance(ONE_MINUTE_MS);

    const response = await app.inject(wrongLogin);

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it('tells how many seconds are left in the current minute', async () => {
    const { app, clock } = emptyApp();
    await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE);
    clock.advance(ONE_MINUTE_MS - 1500);

    const response = await app.inject(wrongLogin);

    expect(response.statusCode).toBe(TOO_MANY_REQUESTS);
    expect(response.headers['retry-after']).toBe('2');
  });
});

describe('rate limit on POST /api/voter/session', () => {
  it('lets a whole classroom behind one address enter in the same minute', async () => {
    const { app } = emptyApp();

    const statuses = await repeat(app, unknownCode, VOTER_SESSION_ATTEMPTS_PER_MINUTE);

    expect(statuses).toEqual(Array(VOTER_SESSION_ATTEMPTS_PER_MINUTE).fill(NOT_FOUND));
  });

  it('answers the next attempt with 429 RATE_LIMITED', async () => {
    const { app } = emptyApp();
    await repeat(app, unknownCode, VOTER_SESSION_ATTEMPTS_PER_MINUTE);

    const response = await app.inject(unknownCode);

    expect(response.statusCode).toBe(TOO_MANY_REQUESTS);
    expect(response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });
});

describe('rate limit scope', () => {
  it('keeps the voter entrance open when the admin login is exhausted', async () => {
    const { app } = emptyApp();
    await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE);

    const response = await app.inject(unknownCode);

    expect(response.statusCode).toBe(NOT_FOUND);
  });

  it('does not limit the other routes', async () => {
    const { app } = emptyApp();
    const health: InjectOptions = { method: 'GET', url: '/api/health' };

    const statuses = await repeat(app, health, VOTER_SESSION_ATTEMPTS_PER_MINUTE + 1);

    expect(statuses).toEqual(Array(VOTER_SESSION_ATTEMPTS_PER_MINUTE + 1).fill(OK));
  });

  it('does not limit anything when RATE_LIMIT is off, as in the e2e runs', async () => {
    const test = makeTestApp({
      config: loadConfig({ NODE_ENV: 'test', BCRYPT_ROUNDS: '4', RATE_LIMIT: 'off' }),
    });
    app = test.app;

    const statuses = await repeat(app, wrongLogin, LOGIN_ATTEMPTS_PER_MINUTE + 1);

    expect(statuses).toEqual(Array(LOGIN_ATTEMPTS_PER_MINUTE + 1).fill(UNAUTHORIZED));
  });
});
