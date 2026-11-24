import { openRound } from '@voto/domain';
import type { AdminElectionDTO, NextPositionDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import type { ElectionRecord } from '../../src/ports';
import {
  ANA,
  appWithTwoAdmins,
  type AuthHeaders,
  type TwoAdminsTestApp,
} from '../support/admin-test-app';
import { draftElectionWithPositions, openElectionWithVoters } from '../support/election-fixtures';
import { anElectionRecord, unwrap } from '../support/election-records';

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

const ELECTION_START = new Date('2026-01-01T12:00:00.000Z');
// Valores derivados do início acima, do prazo padrão (60 s) e da tolerância de voto (1 s).
const DEFAULT_DEADLINE = '2026-01-01T12:01:00.000Z';
const CUSTOM_DEADLINE = '2026-01-01T12:02:00.000Z';
const DEFAULT_DEADLINE_PLUS_GRACE = new Date('2026-01-01T12:01:01.000Z');
const SECONDS_PAST_DEFAULT_DEADLINE = 61 * 1000;

const BELOW_MIN_DURATION_SECONDS = 4;
const TWO_MINUTES_IN_SECONDS = 120;

/**
 * Guarda no repositório uma eleição aberta da Ana com os cargos `mayor` e `treasurer`.
 *
 * @param test - App de teste que recebe a eleição.
 */
async function givenOpenElection(test: TwoAdminsTestApp): Promise<void> {
  await test.deps.electionRepository.create(
    openElectionWithVoters({ id: 'e1', adminId: ANA, positionIds: ['mayor', 'treasurer'] }),
  );
}

/**
 * Abre a rodada de um cargo pela API, como o admin faria, e devolve o id da rodada.
 *
 * @param test - App de teste com a eleição `e1` aberta.
 * @param headers - Autorização do dono da eleição.
 * @param positionId - Cargo a votar.
 * @returns O id da rodada aberta.
 */
async function openRoundVia(
  test: TwoAdminsTestApp,
  headers: AuthHeaders,
  positionId: string,
): Promise<string> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/elections/e1/rounds',
    headers,
    payload: { positionId },
  });
  const { currentRound } = response.json<AdminElectionDTO>();
  return currentRound?.roundId ?? '';
}

/**
 * Eleição aberta em que a rodada de `mayor` foi aberta no instante inicial do relógio de
 * teste (prazo padrão de 60 s) e ninguém votou.
 *
 * @returns Registro da eleição `e1`, da Ana.
 */
function electionWithOpenMayorRound(): ElectionRecord {
  const { current } = openElectionWithVoters({
    id: 'e1',
    adminId: ANA,
    positionIds: ['mayor', 'treasurer'],
  });
  const opened = unwrap(
    openRound(current, { positionId: 'mayor' }, { now: ELECTION_START, newId: () => 'r1' }),
  );
  return { current: opened, past: [] };
}

describe('POST /api/elections/:id/open', () => {
  it('opens a draft election for voting', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/open',
      headers: asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.status).toBe('OPEN');
  });

  it('rejects an election that is already open with 409 ELECTION_NOT_DRAFT', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/open',
      headers: test.asAna,
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ELECTION_NOT_DRAFT' } });
  });

  it('rejects an election without positions with 409 NO_POSITIONS', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(anElectionRecord({ id: 'e1', adminId: ANA }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/open',
      headers: asAna,
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'NO_POSITIONS' } });
  });
});

describe('GET /api/elections/:id/next', () => {
  it('points to the position at the top of the queue', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'GET',
      url: '/api/elections/e1/next',
      headers: test.asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<NextPositionDTO>()).toEqual({ status: 'READY', positionId: 'mayor' });
  });

  it('reports an overdue round as already closed', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenMayorRound());
    test.clock.advance(SECONDS_PAST_DEFAULT_DEADLINE);

    const response = await test.app.inject({
      method: 'GET',
      url: '/api/elections/e1/next',
      headers: test.asAna,
    });

    // Sem votos, a rodada vencida devolve o cargo ao topo da fila.
    expect(response.json<NextPositionDTO>()).toEqual({ status: 'READY', positionId: 'mayor' });
  });

  it('does not save or notify anything, even when a round is overdue', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenMayorRound());
    test.clock.advance(SECONDS_PAST_DEFAULT_DEADLINE);

    await test.app.inject({ method: 'GET', url: '/api/elections/e1/next', headers: test.asAna });

    const stored = await test.deps.electionRepository.get('e1');
    expect({
      version: stored?.current.version,
      roundStatus: stored?.current.rounds[0]?.status,
      notifications: test.notifier.adminStates.length,
    }).toEqual({ version: 0, roundStatus: 'OPEN', notifications: 0 });
  });
});

describe('POST /api/elections/:id/rounds', () => {
  it('opens a round for the position and shows it as the current round', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'mayor' },
    });

    expect(response.statusCode).toBe(CREATED);
    expect(response.json<AdminElectionDTO>().currentRound).toMatchObject({
      positionTitle: 'mayor',
      votedCount: 0,
      eligibleCount: 1,
    });
  });

  it("uses the election's default voting time when no duration is given", async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'mayor' },
    });

    expect(response.json<AdminElectionDTO>().election.rounds[0]?.deadline).toBe(DEFAULT_DEADLINE);
  });

  it('uses the given duration instead of the default', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'mayor', durationSeconds: TWO_MINUTES_IN_SECONDS },
    });

    expect(response.json<AdminElectionDTO>().election.rounds[0]?.deadline).toBe(CUSTOM_DEADLINE);
  });

  it('schedules the automatic closing at the deadline plus the vote grace period', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'mayor' },
    });

    expect(test.scheduler.pending()).toEqual([
      { key: 'round:e1', at: DEFAULT_DEADLINE_PLUS_GRACE },
    ]);
  });

  it('rejects a second round while another is open with 409 ROUND_IN_PROGRESS', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    await openRoundVia(test, test.asAna, 'mayor');

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'treasurer' },
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_IN_PROGRESS' } });
  });

  it('rejects an election without credentialed voters with 409 NO_CREDENTIALED_VOTERS', async () => {
    const { app, asAna, deps } = await appWithTwoAdmins();
    await deps.electionRepository.create(
      openElectionWithVoters({ id: 'e1', adminId: ANA, positionIds: ['mayor'], voterCodes: [] }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: asAna,
      payload: { positionId: 'mayor' },
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'NO_CREDENTIALED_VOTERS' } });
  });

  it('rejects an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'ghost' },
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects a duration below the minimum with 400 VALIDATION_ERROR', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds',
      headers: test.asAna,
      payload: { positionId: 'mayor', durationSeconds: BELOW_MIN_DURATION_SECONDS },
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('POST /api/elections/:id/rounds/:rid/close', () => {
  it('closes the open round before its deadline', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundVia(test, test.asAna, 'mayor');

    const response = await test.app.inject({
      method: 'POST',
      url: `/api/elections/e1/rounds/${roundId}/close`,
      headers: test.asAna,
    });

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.rounds[0]).toMatchObject({
      id: roundId,
      status: 'CLOSED',
    });
  });

  it('cancels the scheduled automatic closing', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundVia(test, test.asAna, 'mayor');

    await test.app.inject({
      method: 'POST',
      url: `/api/elections/e1/rounds/${roundId}/close`,
      headers: test.asAna,
    });

    expect(test.scheduler.pending()).toEqual([]);
  });

  it('rejects an unknown round with 404 ROUND_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/elections/e1/rounds/ghost/close',
      headers: test.asAna,
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_NOT_FOUND' } });
  });

  it('rejects a round that is already closed with 409 ROUND_NOT_OPEN', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundVia(test, test.asAna, 'mayor');
    const url = `/api/elections/e1/rounds/${roundId}/close`;
    await test.app.inject({ method: 'POST', url, headers: test.asAna });

    const response = await test.app.inject({ method: 'POST', url, headers: test.asAna });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_NOT_OPEN' } });
  });
});

describe('authorization of the round routes', () => {
  const ROUTES = [
    ['POST /open', 'POST', '/api/elections/e1/open'],
    ['GET /next', 'GET', '/api/elections/e1/next'],
    ['POST /rounds', 'POST', '/api/elections/e1/rounds'],
    ['POST /rounds/:rid/close', 'POST', '/api/elections/e1/rounds/r1/close'],
  ] as const;

  it.each(ROUTES)('%s rejects a request without token with 401', async (_name, method, url) => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({ method, url, payload: { positionId: 'mayor' } });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it.each(ROUTES)("%s rejects another admin's election with 403", async (_name, method, url) => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({
      method,
      url,
      headers: test.asBia,
      payload: { positionId: 'mayor' },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
  });
});
