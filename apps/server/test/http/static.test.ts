import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerStatic } from '../../src/http/static';
import { makeTestApp } from '../support/make-test-app';

const OK = 200;
const NOT_FOUND = 404;

const INDEX_HTML = '<!doctype html><title>Voto</title><div id="root"></div>';
const APP_SCRIPT = 'console.info("voto");';

let distDir: string;
let app: FastifyInstance | undefined;

// Um build do front de mentira, numa pasta só deste teste: o `registerStatic` lê do disco.
beforeEach(async () => {
  distDir = await mkdtemp(join(tmpdir(), 'voto-web-dist-'));
  await writeFile(join(distDir, 'index.html'), INDEX_HTML);
  await mkdir(join(distDir, 'assets'));
  await writeFile(join(distDir, 'assets', 'app.js'), APP_SCRIPT);
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(distDir, { recursive: true, force: true });
});

/**
 * Monta o app de teste servindo o build do front de mentira.
 *
 * @returns O app, ainda não iniciado.
 */
function appServingTheFrontend(): FastifyInstance {
  const built = makeTestApp().app;
  registerStatic(built, distDir);
  return built;
}

describe('registerStatic', () => {
  it('serves the frontend entry page at the root', async () => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(OK);
    expect(response.body).toBe(INDEX_HTML);
  });

  it('serves a built asset with its own content', async () => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url: '/assets/app.js' });

    expect(response.statusCode).toBe(OK);
    expect(response.body).toBe(APP_SCRIPT);
  });

  it('answers a client-side route with the entry page, so the browser router can show it', async () => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url: '/admin/elections/e1?tab=voters' });

    expect(response.statusCode).toBe(OK);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.body).toBe(INDEX_HTML);
  });

  it('keeps the API routes working', async () => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.json()).toEqual({ status: 'ok' });
  });

  it.each([
    ['an unknown API route', 'GET', '/api/nothing'],
    ['the API root', 'GET', '/api'],
    ['an unknown realtime path', 'GET', '/socket.io/nothing'],
    ['a page path with a method other than GET', 'POST', '/admin/elections'],
  ] as const)('answers %s with 404 NOT_FOUND in JSON', async (_case, method, url) => {
    app = appServingTheFrontend();

    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('still falls back for a page whose path only starts like the API', async () => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url: '/apidocs' });

    expect(response.body).toBe(INDEX_HTML);
  });

  // Uma aba aberta antes de um deploy pede o arquivo do build antigo: com a página de entrada
  // no lugar, o navegador tentaria rodar HTML como JavaScript.
  it.each([
    ['a build file that no longer exists', '/assets/app-old.js'],
    ['a missing file asked with a query string', '/assets/app-old.js?v=2'],
  ])('answers %s with 404 NOT_FOUND in JSON', async (_case, url) => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it.each([
    ['a dot before its last segment', '/results/v1.2/summary'],
    ['a dot only in the query string', '/voter?from=mail.example'],
  ])('still falls back for a page with %s', async (_case, url) => {
    app = appServingTheFrontend();

    const response = await app.inject({ method: 'GET', url });

    expect(response.body).toBe(INDEX_HTML);
  });
});
