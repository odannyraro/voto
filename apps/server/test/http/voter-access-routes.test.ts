import { openRound, revokeVoter } from '@voto/domain';
import type { VoterStateDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import type { ElectionRecord, VoterCodeOwner } from '../../src/ports';
import { ANA, appWithTwoAdmins, type TwoAdminsTestApp } from '../support/admin-test-app';
import { openElectionWithVoters } from '../support/election-fixtures';
import { unwrap } from '../support/election-records';

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;

const VOTER_CODE = 'ABCD2345';
const VOTER_ID = `e1:${VOTER_CODE}`;
const ELECTION_START = new Date('2026-01-01T12:00:00.000Z');
// Prazo padrão da rodada: 60 s depois de aberta.
const DEFAULT_ROUND_SECONDS = 60;
const MILLISECONDS_PER_SECOND = 1000;
const ONE_SECOND_PAST_DEADLINE_MS = (DEFAULT_ROUND_SECONDS + 1) * MILLISECONDS_PER_SECOND;
const HALF_OF_DEADLINE_MS = (DEFAULT_ROUND_SECONDS / 2) * MILLISECONDS_PER_SECOND;

/**
 * Eleição aberta da Ana, com um eleitor, no estado em que o admin ainda não abriu rodada.
 *
 * @returns Registro da eleição `e1` com o cargo `mayor`.
 */
function openElectionWithOneVoter(): ElectionRecord {
  return openElectionWithVoters({
    id: 'e1',
    adminId: ANA,
    positionIds: ['mayor'],
    voterCodes: [VOTER_CODE],
  });
}

/**
 * Mesma eleição, com a rodada de `mayor` aberta no instante inicial do relógio de teste.
 *
 * @returns Registro da eleição `e1` com uma rodada aberta e ninguém tendo votado.
 */
function electionWithOpenMayorRound(): ElectionRecord {
  const { current } = openElectionWithOneVoter();
  const opened = unwrap(
    openRound(current, { positionId: 'mayor' }, { now: ELECTION_START, newId: () => 'r1' }),
  );
  return { current: opened, past: [] };
}

/**
 * Abre a sessão do eleitor pela API e devolve o cabeçalho de autorização dele.
 *
 * @param test - App de teste cuja eleição `e1` já está guardada.
 * @returns O cabeçalho `authorization` do eleitor.
 */
async function sessionHeaders(test: TwoAdminsTestApp): Promise<{ authorization: string }> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/voter/session',
    payload: { code: VOTER_CODE },
  });
  return { authorization: `Bearer ${response.json<{ token: string }>().token}` };
}

/** Repositório cujo índice de códigos aponta para uma eleição que não existe (dado inconsistente). */
class StaleCodeIndexRepository extends InMemoryElectionRepository {
  override findByVoterCode(): Promise<VoterCodeOwner | null> {
    return Promise.resolve({ electionId: 'deleted-election', voterId: 'deleted-election:CODE' });
  }
}

describe('POST /api/voter/session', () => {
  it('returns a voter token and the election the code belongs to', async () => {
    const { app, auth, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(openElectionWithOneVoter());

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/session',
      payload: { code: VOTER_CODE },
    });

    const body = response.json<{ token: string; electionId: string; electionName: string }>();
    expect(response.statusCode).toBe(OK);
    expect(body).toMatchObject({ electionId: 'e1', electionName: 'Board election' });
    expect(await auth.verifyToken(body.token)).toEqual({
      role: 'voter',
      electionId: 'e1',
      voterId: VOTER_ID,
    });
  });

  it('accepts the code in lowercase', async () => {
    const { app, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(openElectionWithOneVoter());

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/session',
      payload: { code: VOTER_CODE.toLowerCase() },
    });

    expect(response.statusCode).toBe(OK);
  });

  it('rejects an unknown code with 404 INVALID_CODE', async () => {
    const { app, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(openElectionWithOneVoter());

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/session',
      payload: { code: 'ZZZZ9999' },
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_CODE' } });
  });

  it('rejects a revoked voter with 403 VOTER_REVOKED', async () => {
    const { app, deps } = await appWithTwoAdmins();
    const { current } = openElectionWithOneVoter();
    await deps.electionRepository.create({
      current: unwrap(revokeVoter(current, VOTER_ID)),
      past: [],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/session',
      payload: { code: VOTER_CODE },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'VOTER_REVOKED' } });
  });

  it('treats a code whose election no longer exists as 404 INVALID_CODE', async () => {
    const { app } = await appWithTwoAdmins({ electionRepository: new StaleCodeIndexRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/session',
      payload: { code: VOTER_CODE },
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_CODE' } });
  });

  it.each([
    { scenario: 'is one character too short', code: 'ABCD234' },
    { scenario: 'is one character too long', code: 'ABCD23456' },
    { scenario: 'is blank', code: '        ' },
  ])('rejects a code that $scenario with 400 VALIDATION_ERROR', async ({ code }) => {
    const { app } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/session',
      payload: { code },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('GET /api/voter/state', () => {
  it('rejects a request without a token with 401 INVALID_TOKEN', async () => {
    const { app } = await appWithTwoAdmins();

    const response = await app.inject({ method: 'GET', url: '/api/voter/state' });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('rejects an admin token with 403 FORBIDDEN', async () => {
    const { app, asAna } = await appWithTwoAdmins();

    const response = await app.inject({ method: 'GET', url: '/api/voter/state', headers: asAna });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('rejects a token whose election no longer exists with 401 INVALID_TOKEN', async () => {
    const { app, auth } = await appWithTwoAdmins();
    const token = await auth.issueVoterToken({ electionId: 'deleted-election', voterId: 'v1' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/voter/state',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('rejects a token for a voter that is not in the election with 401 INVALID_TOKEN', async () => {
    const { app, auth, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(openElectionWithOneVoter());
    const token = await auth.issueVoterToken({ electionId: 'e1', voterId: 'e1:NOBODY' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/voter/state',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('shows WAITING while no round is open', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(openElectionWithOneVoter());

    const response = await test.app.inject({
      method: 'GET',
      url: '/api/voter/state',
      headers: await sessionHeaders(test),
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<VoterStateDTO>()).toMatchObject({
      phase: 'WAITING',
      electionName: 'Board election',
      serverNow: ELECTION_START.toISOString(),
    });
  });

  it('shows the ballot while a round is open and the deadline has not passed', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenMayorRound());
    const headers = await sessionHeaders(test);
    test.clock.advance(HALF_OF_DEADLINE_MS);

    const response = await test.app.inject({ method: 'GET', url: '/api/voter/state', headers });

    expect(response.json<VoterStateDTO>()).toMatchObject({
      phase: 'VOTING',
      round: { roundId: 'r1', positionTitle: 'mayor' },
    });
  });

  it('rejects a revoked voter who still holds a token with 403 VOTER_REVOKED', async () => {
    const test = await appWithTwoAdmins();
    const { current } = openElectionWithOneVoter();
    await test.deps.electionRepository.create({ current, past: [] });
    const headers = await sessionHeaders(test);
    await test.deps.electionRepository.save(
      { current: { ...unwrap(revokeVoter(current, VOTER_ID)), version: 1 }, past: [] },
      0,
    );

    const response = await test.app.inject({ method: 'GET', url: '/api/voter/state', headers });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'VOTER_REVOKED' } });
  });

  it('closes and saves a round whose deadline passed while nobody was looking', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenMayorRound());
    const headers = await sessionHeaders(test);
    test.clock.advance(ONE_SECOND_PAST_DEADLINE_MS);

    const response = await test.app.inject({ method: 'GET', url: '/api/voter/state', headers });

    const saved = await test.deps.electionRepository.get('e1');
    expect(response.json<VoterStateDTO>().phase).toBe('WAITING');
    expect(saved?.current.rounds[0]?.status).toBe('CLOSED');
  });

  it('notifies the admin when consulting the state closes a round', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenMayorRound());
    const headers = await sessionHeaders(test);
    test.clock.advance(ONE_SECOND_PAST_DEADLINE_MS);

    await test.app.inject({ method: 'GET', url: '/api/voter/state', headers });

    expect(test.notifier.adminStates).toHaveLength(1);
  });

  it('does not save or notify when no deadline has passed', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenMayorRound());
    const headers = await sessionHeaders(test);
    test.clock.advance(HALF_OF_DEADLINE_MS);

    await test.app.inject({ method: 'GET', url: '/api/voter/state', headers });

    const saved = await test.deps.electionRepository.get('e1');
    expect(saved?.current.version).toBe(0);
    expect(test.notifier.adminStates).toHaveLength(0);
  });
});
