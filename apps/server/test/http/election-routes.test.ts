import { finishElection } from '@voto/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { anElectionRecord, unwrap } from '../support/election-records';
import { openElectionWithVoters } from '../support/election-fixtures';
import { makeTestApp } from '../support/make-test-app';

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

const ANA = 'admin-ana';
const BIA = 'admin-bia';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Monta o app de teste e devolve, junto, o cabeçalho de autorização de cada admin.
 *
 * @returns O app de teste e os cabeçalhos `authorization` da Ana e da Bia.
 */
async function appWithTwoAdmins() {
  const test = makeTestApp();
  app = test.app;
  const asAna = { authorization: `Bearer ${await test.auth.issueAdminToken(ANA)}` };
  const asBia = { authorization: `Bearer ${await test.auth.issueAdminToken(BIA)}` };
  return { ...test, asAna, asBia };
}

describe('POST /api/elections', () => {
  it('creates a draft election for the logged admin and returns its admin DTO', async () => {
    const { app, asAna } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections',
      headers: asAna,
      payload: { name: 'Board election', defaultVotingSeconds: 90 },
    });

    expect(response.statusCode).toBe(CREATED);
    expect(response.json()).toMatchObject({
      election: { adminId: ANA, name: 'Board election', status: 'DRAFT', defaultVotingSeconds: 90 },
      canUndo: false,
      next: { status: 'NONE_LEFT' },
    });
  });

  it('persists the election so it can be read back', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections',
      headers: asAna,
      payload: { name: 'Board election' },
    });

    const { election } = response.json<{ election: { id: string } }>();
    expect((await deps.electionRepository.get(election.id))?.current.name).toBe('Board election');
  });

  it('rejects a blank name with 400 VALIDATION_ERROR', async () => {
    const { app, asAna } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections',
      headers: asAna,
      payload: { name: '   ' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('GET /api/elections', () => {
  it('lists only the elections of the logged admin', async () => {
    const { app, asBia, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'ana-1', adminId: ANA }));
    await deps.electionRepository.create(
      anElectionRecord({ id: 'bia-1', adminId: BIA, voterCodes: ['CODE-A', 'CODE-B'] }),
    );

    const response = await app.inject({ method: 'GET', url: '/api/elections', headers: asBia });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toEqual([
      { id: 'bia-1', name: 'Board election', status: 'DRAFT', positionCount: 0, voterCount: 2 },
    ]);
  });
});

describe('GET /api/elections/:id', () => {
  it('returns the admin DTO of an election owned by the logged admin', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({ method: 'GET', url: '/api/elections/e1', headers: asAna });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toMatchObject({
      election: { id: 'e1' },
      serverNow: '2026-01-01T12:00:00.000Z',
    });
  });

  it("rejects another admin's election with 403 FORBIDDEN", async () => {
    const { app, asBia, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({ method: 'GET', url: '/api/elections/e1', headers: asBia });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('rejects an unknown id with 404 ELECTION_NOT_FOUND', async () => {
    const { app, asAna } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'GET',
      url: '/api/elections/missing',
      headers: asAna,
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'ELECTION_NOT_FOUND' } });
  });
});

describe('PATCH /api/elections/:id', () => {
  it('renames the election and returns the updated admin DTO', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1',
      headers: asAna,
      payload: { name: 'Annual vote' },
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toMatchObject({ election: { name: 'Annual vote', version: 1 } });
  });

  it('rejects a blank name with 400 VALIDATION_ERROR', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1',
      headers: asAna,
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a change to a finished election with 409 ELECTION_FINISHED', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    const open = openElectionWithVoters({ id: 'e1', adminId: ANA, positionIds: ['president'] });
    await deps.electionRepository.create({
      ...open,
      current: unwrap(finishElection(open.current)),
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1',
      headers: asAna,
      payload: { name: 'Too late' },
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ELECTION_FINISHED' } });
  });

  it("rejects another admin's election with 403 FORBIDDEN", async () => {
    const { app, asBia, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1',
      headers: asBia,
      payload: { name: 'Hijacked' },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
  });
});

describe('election routes authentication', () => {
  it.each([
    { method: 'GET', url: '/api/elections' },
    { method: 'POST', url: '/api/elections' },
    { method: 'GET', url: '/api/elections/e1' },
    { method: 'PATCH', url: '/api/elections/e1' },
  ] as const)('rejects $method $url without token with 401', async ({ method, url }) => {
    const { app } = await appWithTwoAdmins();

    const response = await app.inject({ method, url, payload: { name: 'Board election' } });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('rejects a voter token with 403', async () => {
    const { app, auth } = await appWithTwoAdmins();
    const token = await auth.issueVoterToken({ electionId: 'e1', voterId: 'e1:CODE' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/elections',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
  });
});
