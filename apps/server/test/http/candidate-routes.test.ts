import { addCandidate, castVote, openRound, type DomainContext } from '@voto/domain';
import type { AdminElectionDTO, Election } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { ElectionRecord } from '../../src/ports';
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

const SOME_MOMENT = new Date('2026-01-01T12:00:00.000Z');

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

/** Candidato de exemplo que concorre só ao cargo indicado. */
function candidateFor(positionId: string) {
  return {
    name: 'Ana',
    age: 30,
    remainingMonths: 12,
    applications: [positionId],
    firstChoicePositionId: positionId,
  };
}

/**
 * Rascunho com os cargos `mayor` e `treasurer` e o candidato `c1`, que concorre a `mayor`.
 *
 * @returns Registro da eleição `e1`, da Ana.
 */
function draftWithCandidate(): ElectionRecord {
  const record = draftElectionWithPositions({
    id: 'e1',
    adminId: ANA,
    positionIds: ['mayor', 'treasurer'],
  });
  const ctx: DomainContext = { now: SOME_MOMENT, newId: () => 'c1' };
  const current = unwrap(addCandidate(record.current, candidateFor('mayor'), ctx));
  return { ...record, current };
}

/**
 * Eleição aberta em que o cargo `mayor` já foi decidido a favor de `mayor-candidate`, e o
 * cargo `treasurer` ainda espera votação.
 *
 * @returns Registro da eleição `e1`, da Ana.
 */
function electionWithElectedMayor(): ElectionRecord {
  const { current } = openElectionWithVoters({
    id: 'e1',
    adminId: ANA,
    positionIds: ['mayor', 'treasurer'],
  });
  const ctx: DomainContext = { now: SOME_MOMENT, newId: () => 'round-1' };
  const opened = unwrap(openRound(current, { positionId: 'mayor' }, ctx));
  // Único eleitor: o voto dele fecha a rodada e decide o cargo.
  const voted = unwrap(
    castVote(opened, { roundId: 'round-1', voterId: 'e1:VOTER1', choice: 'mayor-candidate' }, ctx),
  );
  return { current: voted, past: [] };
}

/** Procura um candidato pelo id no estado devolvido pela API. */
function findCandidate(election: Election, id: string) {
  return election.candidates.find((candidate) => candidate.id === id);
}

describe('POST /api/elections/:id/candidates', () => {
  it('registers the candidate in the election', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/candidates',
      headers: asAna,
      payload: candidateFor('mayor'),
    });

    expect(response.statusCode).toBe(CREATED);
    expect(response.json<AdminElectionDTO>().election.candidates).toMatchObject([
      { name: 'Ana', age: 30, applications: ['mayor'], firstChoicePositionId: 'mayor' },
    ]);
  });

  it('rejects a first choice outside the applications with 400 VALIDATION_ERROR', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor', 'treasurer'] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/candidates',
      headers: asAna,
      payload: { ...candidateFor('mayor'), firstChoicePositionId: 'treasurer' },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects an application to an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/candidates',
      headers: asAna,
      payload: candidateFor('ghost'),
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });
});

describe('PATCH /api/elections/:id/candidates/:cid', () => {
  it('changes only the fields sent', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1/candidates/c1',
      headers: asAna,
      payload: { age: 41 },
    });

    expect(response.statusCode).toBe(OK);
    expect(findCandidate(response.json<AdminElectionDTO>().election, 'c1')).toMatchObject({
      name: 'Ana',
      age: 41,
    });
  });

  it('rejects an unknown candidate with 404 CANDIDATE_NOT_FOUND', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1/candidates/ghost',
      headers: asAna,
      payload: { age: 41 },
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'CANDIDATE_NOT_FOUND' } });
  });

  it('rejects an age below the minimum with 400 VALIDATION_ERROR', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/elections/e1/candidates/c1',
      headers: asAna,
      payload: { age: 15 },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('DELETE /api/elections/:id/candidates/:cid', () => {
  it('removes the candidate from the election', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/elections/e1/candidates/c1',
      headers: asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.candidates).toEqual([]);
  });

  it('rejects an unknown candidate with 404 CANDIDATE_NOT_FOUND', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/elections/e1/candidates/ghost',
      headers: asAna,
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'CANDIDATE_NOT_FOUND' } });
  });
});

describe('POST /api/elections/:id/positions/:pid/candidates/:cid', () => {
  it('adds the position to the applications of the existing candidate', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/positions/treasurer/candidates/c1',
      headers: asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(findCandidate(response.json<AdminElectionDTO>().election, 'c1')?.applications).toEqual([
      'mayor',
      'treasurer',
    ]);
  });

  it('rejects an already elected candidate with 409 CANDIDATE_ALREADY_ELECTED', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(electionWithElectedMayor());

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/positions/treasurer/candidates/mayor-candidate',
      headers: asAna,
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'CANDIDATE_ALREADY_ELECTED' } });
  });

  it('rejects an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/positions/ghost/candidates/c1',
      headers: asAna,
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });
});

describe('candidate routes authentication', () => {
  const routes = [
    { method: 'POST', url: '/api/elections/e1/candidates', payload: candidateFor('mayor') },
    { method: 'PATCH', url: '/api/elections/e1/candidates/c1', payload: { age: 41 } },
    { method: 'DELETE', url: '/api/elections/e1/candidates/c1', payload: undefined },
    {
      method: 'POST',
      url: '/api/elections/e1/positions/treasurer/candidates/c1',
      payload: undefined,
    },
  ] as const;

  it.each(routes)('rejects $method $url without token with 401', async (route) => {
    const { app } = await appWithTwoAdmins();

    const response = await app.inject(route);

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it.each(routes)("rejects $method $url on another admin's election with 403", async (route) => {
    const { app, asBia, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(draftWithCandidate());

    const response = await app.inject({ ...route, headers: asBia });

    expect(response.statusCode).toBe(FORBIDDEN);
  });
});
