import { addCandidate } from '@voto/domain';
import type { AdminElectionDTO } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { draftElectionWithPositions, openElectionWithVoters } from '../support/election-fixtures';
import { unwrap } from '../support/election-records';
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
 * Monta o app de teste e devolve o cabeçalho de autorização de cada admin.
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

describe('POST /api/elections/:id/positions', () => {
  it('adds the position to the election and to the end of the queue', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/positions',
      headers: asAna,
      payload: { title: 'Treasurer', tiebreak: 'OLDEST' },
    });

    const { election } = response.json<AdminElectionDTO>();
    expect(response.statusCode).toBe(CREATED);
    expect(election.positions.map((position) => position.title)).toEqual(['mayor', 'Treasurer']);
    expect(election.queue).toHaveLength(2);
  });

  it('rejects an unknown tiebreak rule with 400 VALIDATION_ERROR', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: [] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/positions',
      headers: asAna,
      payload: { title: 'Treasurer', tiebreak: 'TALLEST' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a repeated title with 409 DUPLICATE_POSITION_TITLE', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/positions',
      headers: asAna,
      payload: { title: 'mayor', tiebreak: 'YOUNGEST' },
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'DUPLICATE_POSITION_TITLE' } });
  });
});

describe('PATCH /api/elections/:id/positions/:pid', () => {
  it('renames the position and keeps its tiebreak rule', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1/positions/mayor',
      headers: asAna,
      payload: { title: 'Head of board' },
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.positions[0]).toMatchObject({
      id: 'mayor',
      title: 'Head of board',
      tiebreak: 'YOUNGEST',
    });
  });

  it('rejects an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1/positions/ghost',
      headers: asAna,
      payload: { title: 'Head of board' },
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });
});

describe('DELETE /api/elections/:id/positions/:pid', () => {
  it('removes the position from the election and from the queue', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor', 'treasurer'] }),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/elections/e1/positions/mayor',
      headers: asAna,
    });

    const { election } = response.json<AdminElectionDTO>();
    expect(response.statusCode).toBe(OK);
    expect(election.queue).toEqual(['treasurer']);
  });

  it('rejects removal once the election is open with 409 ELECTION_NOT_DRAFT', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      openElectionWithVoters({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/elections/e1/positions/mayor',
      headers: asAna,
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ELECTION_NOT_DRAFT' } });
  });
});

describe('PUT /api/elections/:id/queue', () => {
  it('applies the new voting order', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor', 'treasurer'] }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: '/api/elections/e1/queue',
      headers: asAna,
      payload: { positionIds: ['treasurer', 'mayor'] },
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.queue).toEqual(['treasurer', 'mayor']);
  });

  it('rejects an order that leaves a position out with 409 INVALID_QUEUE_ORDER', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor', 'treasurer'] }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: '/api/elections/e1/queue',
      headers: asAna,
      payload: { positionIds: ['treasurer'] },
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_QUEUE_ORDER' } });
  });

  it('rejects a body without positionIds with 400 VALIDATION_ERROR', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: '/api/elections/e1/queue',
      headers: asAna,
      payload: {},
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('GET /api/elections/:id/queue/suggestion', () => {
  /** Eleição com o cargo `treasurer` disputado por dois candidatos e `mayor` por um só. */
  function electionWithContestedSecondPosition() {
    const record = draftElectionWithPositions({
      id: 'e1',
      adminId: ANA,
      positionIds: ['mayor', 'treasurer'],
    });
    const candidates = [
      { id: 'c1', position: 'mayor' },
      { id: 'c2', position: 'treasurer' },
      { id: 'c3', position: 'treasurer' },
    ];
    const current = candidates.reduce(
      (election, { id, position }) =>
        unwrap(
          addCandidate(
            election,
            {
              name: `Candidate ${id}`,
              age: 30,
              remainingMonths: 12,
              applications: [position],
              firstChoicePositionId: position,
            },
            { now: new Date('2026-01-01T12:00:00.000Z'), newId: () => id },
          ),
        ),
      record.current,
    );
    return { ...record, current };
  }

  it('suggests the contested position first', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(electionWithContestedSecondPosition());

    const response = await app.inject({
      method: 'GET',
      url: '/api/elections/e1/queue/suggestion',
      headers: asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json()).toEqual({ positionIds: ['treasurer', 'mayor'] });
  });

  it('does not change the stored queue', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(electionWithContestedSecondPosition());

    await app.inject({ method: 'GET', url: '/api/elections/e1/queue/suggestion', headers: asAna });

    const stored = await deps.electionRepository.get('e1');
    expect(stored?.current).toMatchObject({ queue: ['mayor', 'treasurer'], version: 0 });
  });

  it('notifies nobody', async () => {
    const { app, asAna, deps, notifier } = await appWithTwoAdmins();
    await deps.electionRepository.create(electionWithContestedSecondPosition());

    await app.inject({ method: 'GET', url: '/api/elections/e1/queue/suggestion', headers: asAna });

    expect(notifier.adminStates).toEqual([]);
  });
});

describe('position routes authentication', () => {
  it.each([
    { method: 'POST', url: '/api/elections/e1/positions' },
    { method: 'PATCH', url: '/api/elections/e1/positions/mayor' },
    { method: 'DELETE', url: '/api/elections/e1/positions/mayor' },
    { method: 'PUT', url: '/api/elections/e1/queue' },
    { method: 'GET', url: '/api/elections/e1/queue/suggestion' },
  ] as const)('rejects $method $url without token with 401', async ({ method, url }) => {
    const { app } = await appWithTwoAdmins();

    const response = await app.inject({ method, url, payload: {} });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it.each([
    {
      method: 'POST',
      url: '/api/elections/e1/positions',
      payload: { title: 'T', tiebreak: 'OLDEST' },
    },
    { method: 'PUT', url: '/api/elections/e1/queue', payload: { positionIds: ['mayor'] } },
    { method: 'GET', url: '/api/elections/e1/queue/suggestion', payload: undefined },
  ] as const)("rejects $method $url on another admin's election with 403", async (request) => {
    const { app, asBia, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({ ...request, headers: asBia });

    expect(response.statusCode).toBe(FORBIDDEN);
  });
});
