import type { AdminElectionDTO } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { StubCodeGenerator } from '../doubles/stub-code-generator';
import { anElectionRecord } from '../support/election-records';
import { makeTestApp } from '../support/make-test-app';

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

const ANA = 'admin-ana';
const MAX_VOTERS_PER_BATCH = 500;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Monta o app de teste com o gerador de códigos devolvendo `codes` e o cabeçalho da Ana.
 *
 * @param codes - Códigos que o gerador entrega, na ordem.
 * @returns O app de teste e o cabeçalho `authorization` da Ana.
 */
async function appWithCodes(codes: readonly string[]) {
  const test = makeTestApp({ codeGenerator: new StubCodeGenerator(codes) });
  app = test.app;
  const asAna = { authorization: `Bearer ${await test.auth.issueAdminToken(ANA)}` };
  return { ...test, asAna };
}

describe('POST /api/elections/:id/voters', () => {
  it('returns the generated codes and the election with the new voters', async () => {
    const { app, asAna, deps } = await appWithCodes(['AAAAAAAA', 'BBBBBBBB']);
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/voters',
      headers: asAna,
      payload: { count: 2 },
    });

    expect(response.statusCode).toBe(CREATED);
    expect(response.json<{ codes: string[]; election: AdminElectionDTO }>()).toMatchObject({
      codes: ['AAAAAAAA', 'BBBBBBBB'],
      election: { election: { voters: [{ code: 'AAAAAAAA' }, { code: 'BBBBBBBB' }] } },
    });
  });

  it('accepts the largest batch', async () => {
    const codes = Array.from(
      { length: MAX_VOTERS_PER_BATCH },
      (_, i) => `CODE${String(i).padStart(4, '0')}`,
    );
    const { app, asAna, deps } = await appWithCodes(codes);
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/voters',
      headers: asAna,
      payload: { count: MAX_VOTERS_PER_BATCH },
    });

    expect(response.statusCode).toBe(CREATED);
  });

  it.each([
    ['zero', 0],
    ['one above the limit', MAX_VOTERS_PER_BATCH + 1],
  ])('rejects a count of %s with 400 VALIDATION_ERROR', async (_name, count) => {
    const { app, asAna, deps } = await appWithCodes([]);
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/voters',
      headers: asAna,
      payload: { count },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a request without token with 401', async () => {
    const { app, deps } = await appWithCodes([]);
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/voters',
      payload: { count: 1 },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });
});

describe('DELETE /api/elections/:id/voters/:vid', () => {
  it('shows the voter as REVOKED in the returned election', async () => {
    const { app, asAna, deps } = await appWithCodes([]);
    await deps.electionRepository.create(
      anElectionRecord({ id: 'e1', adminId: ANA, voterCodes: ['AAAAAAAA'] }),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/elections/e1/voters/e1:AAAAAAAA',
      headers: asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.voters).toMatchObject([
      { code: 'AAAAAAAA', status: 'REVOKED' },
    ]);
  });

  it('rejects an unknown voter with 404 VOTER_NOT_FOUND', async () => {
    const { app, asAna, deps } = await appWithCodes([]);
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/elections/e1/voters/ghost',
      headers: asAna,
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'VOTER_NOT_FOUND' } });
  });

  it('rejects a request without token with 401', async () => {
    const { app } = await appWithCodes([]);

    const response = await app.inject({ method: 'DELETE', url: '/api/elections/e1/voters/v1' });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });
});
