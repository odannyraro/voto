import { revokeVoter } from '@voto/domain';
import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import type { ElectionRecord } from '../../src/ports';
import { ANA, appWithTwoAdmins, type TwoAdminsTestApp } from '../support/admin-test-app';
import { openElectionWithVoters, withOpenRound } from '../support/election-fixtures';
import { unwrap } from '../support/election-records';

const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;

const FIRST_CODE = 'ABCD2345';
const SECOND_CODE = 'WXYZ6789';
const FIRST_VOTER_ID = `e1:${FIRST_CODE}`;
const SECOND_VOTER_ID = `e1:${SECOND_CODE}`;
const MAYOR_CANDIDATE = 'mayor-candidate';
const ELECTION_START = new Date('2026-01-01T12:00:00.000Z');
// Prazo padrão da rodada (60 s) e tolerância padrão do servidor (VOTE_GRACE_MS = 1000).
const ROUND_DURATION_MS = 60_000;
const GRACE_MS = 1000;
const LAST_ACCEPTED_MS = ROUND_DURATION_MS + GRACE_MS;
const FIRST_REJECTED_MS = LAST_ACCEPTED_MS + 1;

/**
 * Eleição `e1` da Ana, com os dois eleitores credenciados e a rodada de `mayor` aberta.
 *
 * @param voterCodes - Códigos dos eleitores (padrão: os dois eleitores do cenário).
 * @returns Registro com a rodada `r1` aberta e ninguém tendo votado.
 */
function electionWithOpenRound(voterCodes = [FIRST_CODE, SECOND_CODE]): ElectionRecord {
  return withOpenRound(
    openElectionWithVoters({ id: 'e1', adminId: ANA, positionIds: ['mayor'], voterCodes }),
    { positionId: 'mayor', roundId: 'r1', openedAt: ELECTION_START },
  );
}

/**
 * Abre a sessão do eleitor pela API e devolve o cabeçalho de autorização dele.
 *
 * @param test - App de teste cuja eleição já está guardada.
 * @param code - Código do eleitor.
 * @returns O cabeçalho `authorization` do eleitor.
 */
async function voterHeaders(
  test: TwoAdminsTestApp,
  code: string,
): Promise<{ authorization: string }> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/voter/session',
    payload: { code },
  });
  return { authorization: `Bearer ${response.json<{ token: string }>().token}` };
}

/**
 * Registra no app de teste a eleição com rodada aberta e devolve o cabeçalho do 1º eleitor.
 *
 * @param test - App de teste.
 * @param record - Eleição a guardar (padrão: dois eleitores, rodada aberta).
 * @returns O cabeçalho do primeiro eleitor.
 */
async function seededFirstVoter(
  test: TwoAdminsTestApp,
  record = electionWithOpenRound(),
): Promise<{ authorization: string }> {
  await test.deps.electionRepository.create(record);
  return voterHeaders(test, FIRST_CODE);
}

/**
 * Faz o admin abrir a rodada de `mayor` pela API (o que agenda o fechamento).
 *
 * @param test - App de teste cuja eleição `e1` está aberta e sem rodada.
 * @returns O id da rodada aberta.
 */
async function openMayorRoundAsAdmin(test: TwoAdminsTestApp): Promise<string> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/elections/e1/rounds',
    headers: test.asAna,
    payload: { positionId: 'mayor' },
  });
  return response.json<AdminElectionDTO>().election.rounds[0]?.id ?? '';
}

describe('POST /api/voter/votes', () => {
  it('accepts a valid vote with 204', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(NO_CONTENT);
  });

  it('accepts a blank vote', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: 'BLANK' },
    });

    expect(response.statusCode).toBe(NO_CONTENT);
  });

  it('notifies the admin with the voting progress', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    const lastAdminState = test.notifier.adminStates.at(-1)?.state;
    expect(lastAdminState?.currentRound).toMatchObject({ votedCount: 1, eligibleCount: 2 });
  });

  it('tells the voter that the vote was registered', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    const ownStates = test.notifier.voterStates.filter(({ voterId }) => voterId === FIRST_VOTER_ID);
    expect(ownStates.at(-1)?.state).toMatchObject({ phase: 'VOTED', roundId: 'r1' });
  });

  it('keeps the other voters on the ballot after one of them votes', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    const otherStates = test.notifier.voterStates.filter(
      ({ voterId }) => voterId === SECOND_VOTER_ID,
    );
    expect(otherStates.at(-1)?.state).toMatchObject({ phase: 'VOTING' });
  });

  it('rejects a second vote from the same voter with 409 VOTER_ALREADY_VOTED', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);
    const vote = { roundId: 'r1', choice: MAYOR_CANDIDATE };
    await test.app.inject({ method: 'POST', url: '/api/voter/votes', headers, payload: vote });

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: vote,
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'VOTER_ALREADY_VOTED' } });
  });

  it('accepts a vote exactly at the deadline plus the grace period', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);
    test.clock.advance(LAST_ACCEPTED_MS);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(NO_CONTENT);
  });

  it('rejects a vote one millisecond after the grace period with 410 ROUND_EXPIRED', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);
    test.clock.advance(FIRST_REJECTED_MS);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(GONE);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_EXPIRED' } });
  });

  it('does not save anything when the vote arrives too late', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);
    test.clock.advance(FIRST_REJECTED_MS);

    await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    const saved = await test.deps.electionRepository.get('e1');
    expect(saved?.current.version).toBe(0);
    expect(test.notifier.adminStates).toHaveLength(0);
  });

  it('cancels the scheduled closing when the last voter closes the round', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(
      openElectionWithVoters({
        id: 'e1',
        adminId: ANA,
        positionIds: ['mayor'],
        voterCodes: [FIRST_CODE],
      }),
    );
    const headers = await voterHeaders(test, FIRST_CODE);
    const roundId = await openMayorRoundAsAdmin(test);
    const scheduledBeforeVote = test.scheduler.pending().length;

    await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId, choice: MAYOR_CANDIDATE },
    });

    expect(scheduledBeforeVote).toBe(1);
    expect(test.scheduler.pending()).toHaveLength(0);
  });

  it('keeps the closing scheduled while someone has not voted yet', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(
      openElectionWithVoters({
        id: 'e1',
        adminId: ANA,
        positionIds: ['mayor'],
        voterCodes: [FIRST_CODE, SECOND_CODE],
      }),
    );
    const headers = await voterHeaders(test, FIRST_CODE);
    const roundId = await openMayorRoundAsAdmin(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId, choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(NO_CONTENT);
    expect(test.scheduler.pending()).toHaveLength(1);
  });

  it('rejects a choice that is not on the ballot with 409 INVALID_CHOICE', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: 'someone-else' },
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_CHOICE' } });
  });

  it('rejects a vote in a round that does not exist with 404 ROUND_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'missing-round', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_NOT_FOUND' } });
  });

  it('does not let a voter of another election vote in this election round', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionWithOpenRound());
    await test.deps.electionRepository.create(
      openElectionWithVoters({
        id: 'e2',
        adminId: ANA,
        positionIds: ['mayor'],
        voterCodes: ['OTHR2345'],
      }),
    );
    const outsiderHeaders = await voterHeaders(test, 'OTHR2345');

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers: outsiderHeaders,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    const untouched = await test.deps.electionRepository.get('e1');
    expect(response.statusCode).toBe(NOT_FOUND);
    expect(untouched?.current.rounds[0]?.votedVoterIds).toEqual([]);
  });

  it('rejects a voter revoked after the round opened with 403 VOTER_REVOKED', async () => {
    const test = await appWithTwoAdmins();
    const record = electionWithOpenRound();
    const headers = await seededFirstVoter(test, record);
    await test.deps.electionRepository.save(
      {
        current: { ...unwrap(revokeVoter(record.current, FIRST_VOTER_ID)), version: 1 },
        past: [],
      },
      0,
    );

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
    expect(response.json()).toMatchObject({ error: { code: 'VOTER_REVOKED' } });
  });

  it('rejects a token whose election no longer exists with 401 INVALID_TOKEN', async () => {
    const test = await appWithTwoAdmins();
    const token = await test.auth.issueVoterToken({ electionId: 'deleted', voterId: 'v1' });

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers: { authorization: `Bearer ${token}` },
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it.each([
    { scenario: 'is missing', payload: { roundId: 'r1' } },
    { scenario: 'is blank', payload: { roundId: 'r1', choice: '   ' } },
  ])('rejects a vote whose choice $scenario with 400 VALIDATION_ERROR', async ({ payload }) => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);

    const response = await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload,
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a request without a token with 401 INVALID_TOKEN', async () => {
    const { app } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it('rejects an admin token with 403 FORBIDDEN', async () => {
    const { app, asAna } = await appWithTwoAdmins();

    const response = await app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers: asAna,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    expect(response.statusCode).toBe(FORBIDDEN);
  });

  it('shows VOTED on the state endpoint after voting', async () => {
    const test = await appWithTwoAdmins();
    const headers = await seededFirstVoter(test);
    await test.app.inject({
      method: 'POST',
      url: '/api/voter/votes',
      headers,
      payload: { roundId: 'r1', choice: MAYOR_CANDIDATE },
    });

    const state = await test.app.inject({ method: 'GET', url: '/api/voter/state', headers });

    expect(state.json<VoterStateDTO>()).toMatchObject({ phase: 'VOTED', roundId: 'r1' });
  });
});
