import { addCandidate, castVote, openRound } from '@voto/domain';
import type { AdminElectionDTO } from '@voto/shared';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { ElectionRecord } from '../../src/ports';
import {
  ANA,
  appWithTwoAdmins,
  openRoundViaApi,
  type AuthHeaders,
  type TwoAdminsTestApp,
} from '../support/admin-test-app';
import { draftElectionWithPositions, openElectionWithVoters } from '../support/election-fixtures';
import { unwrap } from '../support/election-records';

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

const ELECTION_START = new Date('2026-01-01T12:00:00.000Z');
// Prazo padrão (60 s) a partir do início acima, mais a tolerância de voto (1 s).
const DEFAULT_DEADLINE_PLUS_GRACE = new Date('2026-01-01T12:01:01.000Z');
const BELOW_MIN_DURATION_SECONDS = 4;

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
 * Fecha a rodada pela API, antes do prazo.
 *
 * @param test - App de teste com a rodada aberta.
 * @param roundId - Rodada a fechar.
 */
async function closeRoundVia(test: TwoAdminsTestApp, roundId: string): Promise<void> {
  await test.app.inject({
    method: 'POST',
    url: `/api/elections/e1/rounds/${roundId}/close`,
    headers: test.asAna,
  });
}

/**
 * Faz um POST na API, com ou sem corpo.
 *
 * @param test - App de teste.
 * @param headers - Autorização de quem faz a chamada.
 * @param url - Rota POST a chamar.
 * @param payload - Corpo da requisição, se a rota exigir um.
 * @returns A resposta do `inject`.
 */
async function post(
  test: TwoAdminsTestApp,
  headers: AuthHeaders,
  url: string,
  payload?: object,
): Promise<LightMyRequestResponse> {
  return test.app.inject({ method: 'POST', url, headers, payload });
}

/**
 * Eleição em que o 1º turno de `mayor` fechou com 3 candidatos e sem maioria: Ana e Bia têm
 * 2 votos cada (40%) e Cris tem 1. O cargo fica `AWAITING_RUNOFF`, com Ana e Bia de finalistas.
 *
 * @returns Registro da eleição `e1`, da admin Ana.
 */
function electionAwaitingRunoff(): ElectionRecord {
  const voterCodes = ['V1', 'V2', 'V3', 'V4', 'V5'];
  const { current } = openElectionWithVoters({
    id: 'e1',
    adminId: ANA,
    positionIds: ['mayor'],
    voterCodes,
  });
  const withBia = unwrap(addCandidate(current, aMayorCandidate('Bia'), idContext('mayor-bia')));
  const withCris = unwrap(addCandidate(withBia, aMayorCandidate('Cris'), idContext('mayor-cris')));
  const opened = unwrap(openRound(withCris, { positionId: 'mayor' }, idContext('r1')));
  const votes = ['mayor-candidate', 'mayor-candidate', 'mayor-bia', 'mayor-bia', 'mayor-cris'];
  const voted = votes.reduce(
    (election, choice, index) =>
      unwrap(
        castVote(
          election,
          { roundId: 'r1', voterId: `e1:${voterCodes[index]}`, choice },
          idContext('unused'),
        ),
      ),
    opened,
  );
  return { current: voted, past: [] };
}

/**
 * Dados de um candidato a prefeito; só o nome importa para os testes.
 *
 * @param name - Nome do candidato.
 * @returns Entrada para `addCandidate`.
 */
function aMayorCandidate(name: string) {
  return {
    name,
    age: 30,
    remainingMonths: 12,
    applications: ['mayor'],
    firstChoicePositionId: 'mayor',
  };
}

/**
 * Contexto de domínio com relógio fixo e um único id previsível.
 *
 * @param id - Id que o comando vai receber.
 * @returns O contexto do comando.
 */
function idContext(id: string) {
  return { now: ELECTION_START, newId: () => id };
}

describe('POST /api/elections/:id/positions/:pid/runoff', () => {
  it('opens a runoff round between the two finalists', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionAwaitingRunoff());

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/runoff');

    const { currentRound } = response.json<AdminElectionDTO>();
    expect(response.statusCode).toBe(CREATED);
    expect(currentRound).toMatchObject({
      kind: 'RUNOFF',
      candidates: [
        { id: 'mayor-candidate', name: 'Candidate for mayor' },
        { id: 'mayor-bia', name: 'Bia' },
      ],
    });
  });

  it('schedules the automatic closing at the deadline plus the vote grace period', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionAwaitingRunoff());

    await post(test, test.asAna, '/api/elections/e1/positions/mayor/runoff');

    expect(test.scheduler.pending()).toEqual([
      { key: 'round:e1', at: DEFAULT_DEADLINE_PLUS_GRACE },
    ]);
  });

  it('rejects a position that does not need a runoff with 409 POSITION_NOT_AWAITING_RUNOFF', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/runoff');

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_AWAITING_RUNOFF' } });
  });

  it('rejects an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/ghost/runoff');

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });

  it('rejects a duration below the minimum with 400 VALIDATION_ERROR', async () => {
    const test = await appWithTwoAdmins();
    await test.deps.electionRepository.create(electionAwaitingRunoff());

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/runoff', {
      durationSeconds: BELOW_MIN_DURATION_SECONDS,
    });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('POST /api/elections/:id/rounds/:rid/release', () => {
  it('shows the voter the result of the closed round', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });
    await closeRoundVia(test, roundId);

    const response = await post(test, test.asAna, `/api/elections/e1/rounds/${roundId}/release`);

    expect(response.statusCode).toBe(OK);
    expect(test.notifier.voterStates.at(-1)).toMatchObject({
      voterId: 'e1:VOTER1',
      state: { phase: 'RESULTS', result: { roundId } },
    });
  });

  it('marks the round results as released in the admin panel', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });
    await closeRoundVia(test, roundId);

    const response = await post(test, test.asAna, `/api/elections/e1/rounds/${roundId}/release`);

    expect(response.json<AdminElectionDTO>().election.rounds[0]).toMatchObject({
      id: roundId,
      resultsReleased: true,
    });
  });

  it('rejects a round that is still open with 409 ROUND_NOT_CLOSED', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });

    const response = await post(test, test.asAna, `/api/elections/e1/rounds/${roundId}/release`);

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_NOT_CLOSED' } });
  });

  it('rejects an unknown round with 404 ROUND_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/rounds/ghost/release');

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_NOT_FOUND' } });
  });
});

describe('POST /api/elections/:id/positions/:pid/defer', () => {
  it('moves the position to the end of the queue', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/defer');

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.queue).toEqual(['treasurer', 'mayor']);
  });

  it('rejects a position that is being voted with 409 POSITION_NOT_PENDING', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/defer');

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_PENDING' } });
  });

  it('rejects an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/ghost/defer');

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });
});

describe('POST /api/elections/:id/positions/:pid/cancel', () => {
  it('cancels the position and takes it out of the queue when the title matches', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/cancel', {
      confirmTitle: 'mayor',
    });

    const { election } = response.json<AdminElectionDTO>();
    expect(response.statusCode).toBe(OK);
    expect({
      mayor: election.positions.find((position) => position.id === 'mayor')?.status,
      queue: election.queue,
    }).toEqual({ mayor: 'CANCELLED', queue: ['treasurer'] });
  });

  it('rejects a title that does not match with 409 CONFIRMATION_MISMATCH', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/cancel', {
      confirmTitle: 'treasurer',
    });

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'CONFIRMATION_MISMATCH' } });
  });

  it('rejects a request without confirmTitle with 400 VALIDATION_ERROR', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/mayor/cancel', {});

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects an unknown position with 404 POSITION_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/positions/ghost/cancel', {
      confirmTitle: 'ghost',
    });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'POSITION_NOT_FOUND' } });
  });
});

describe('POST /api/elections/:id/rounds/:rid/annul', () => {
  it('annuls the open round and puts the position back in the queue', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });

    const response = await post(test, test.asAna, `/api/elections/e1/rounds/${roundId}/annul`);

    const { election } = response.json<AdminElectionDTO>();
    expect(response.statusCode).toBe(OK);
    expect({ round: election.rounds[0]?.status, queue: election.queue }).toEqual({
      round: 'ANNULLED',
      queue: ['mayor', 'treasurer'],
    });
  });

  it('cancels the scheduled automatic closing', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });

    await post(test, test.asAna, `/api/elections/e1/rounds/${roundId}/annul`);

    expect(test.scheduler.pending()).toEqual([]);
  });

  it('rejects an unknown round with 404 ROUND_NOT_FOUND', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/rounds/ghost/annul');

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_NOT_FOUND' } });
  });
});

describe('POST /api/elections/:id/finish', () => {
  it('finishes the election', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/finish');

    expect(response.statusCode).toBe(OK);
    expect(response.json<AdminElectionDTO>().election.status).toBe('FINISHED');
  });

  it('rejects finishing while a round is open with 409 ROUND_IN_PROGRESS', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });

    const response = await post(test, test.asAna, '/api/elections/e1/finish');

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'ROUND_IN_PROGRESS' } });
  });
});

describe('POST /api/elections/:id/undo', () => {
  /**
   * Guarda um rascunho com o cargo `mayor` e, pela API, acrescenta o cargo `Treasurer`
   * (versão 1, com um estado anterior para desfazer).
   *
   * @param test - App de teste que recebe a eleição.
   */
  async function givenPositionAddedAfterDraft(test: TwoAdminsTestApp): Promise<void> {
    await test.deps.electionRepository.create(
      draftElectionWithPositions({ id: 'e1', adminId: ANA, positionIds: ['mayor'] }),
    );
    await post(test, test.asAna, '/api/elections/e1/positions', {
      title: 'Treasurer',
      tiebreak: 'OLDEST',
    });
  }

  it('restores the state before the last command', async () => {
    const test = await appWithTwoAdmins();
    await givenPositionAddedAfterDraft(test);

    const response = await post(test, test.asAna, '/api/elections/e1/undo');

    const { election, canUndo } = response.json<AdminElectionDTO>();
    expect(response.statusCode).toBe(OK);
    expect({ titles: election.positions.map((position) => position.title), canUndo }).toEqual({
      titles: ['mayor'],
      canUndo: false,
    });
  });

  it('saves the restored state with a version higher than the one it replaces', async () => {
    const test = await appWithTwoAdmins();
    await givenPositionAddedAfterDraft(test);

    await post(test, test.asAna, '/api/elections/e1/undo');

    // Versão 0 → 1 (cargo criado) → 2 (desfeito): a versão restaurada (0) não pode voltar no tempo.
    expect((await test.deps.electionRepository.get('e1'))?.current.version).toBe(2);
  });

  it('does not push a new snapshot onto the history', async () => {
    const test = await appWithTwoAdmins();
    await givenPositionAddedAfterDraft(test);

    await post(test, test.asAna, '/api/elections/e1/undo');

    expect((await test.deps.electionRepository.get('e1'))?.past).toEqual([]);
  });

  it('notifies the admin with the restored state', async () => {
    const test = await appWithTwoAdmins();
    await givenPositionAddedAfterDraft(test);

    await post(test, test.asAna, '/api/elections/e1/undo');

    const titles = test.notifier.adminStates
      .at(-1)
      ?.state.election.positions.map((position) => position.title);
    expect(titles).toEqual(['mayor']);
  });

  it('reschedules the automatic closing when the undo reopens a round', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);
    const roundId = await openRoundViaApi(test, { electionId: 'e1', positionId: 'mayor' });
    await closeRoundVia(test, roundId);

    await post(test, test.asAna, '/api/elections/e1/undo');

    expect(test.scheduler.pending()).toEqual([
      { key: 'round:e1', at: DEFAULT_DEADLINE_PLUS_GRACE },
    ]);
  });

  it('rejects an election without history with 409 NOTHING_TO_UNDO', async () => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asAna, '/api/elections/e1/undo');

    expect(response.statusCode).toBe(CONFLICT);
    expect(response.json()).toMatchObject({ error: { code: 'NOTHING_TO_UNDO' } });
  });
});

describe('authorization of the resolution routes', () => {
  const ROUTES = [
    ['POST /positions/:pid/runoff', '/api/elections/e1/positions/mayor/runoff'],
    ['POST /rounds/:rid/release', '/api/elections/e1/rounds/r1/release'],
    ['POST /positions/:pid/defer', '/api/elections/e1/positions/mayor/defer'],
    ['POST /positions/:pid/cancel', '/api/elections/e1/positions/mayor/cancel'],
    ['POST /rounds/:rid/annul', '/api/elections/e1/rounds/r1/annul'],
    ['POST /undo', '/api/elections/e1/undo'],
    ['POST /finish', '/api/elections/e1/finish'],
  ] as const;
  const BODY = { confirmTitle: 'mayor' };

  it.each(ROUTES)('%s rejects a request without token with 401', async (_name, url) => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await test.app.inject({ method: 'POST', url, payload: BODY });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it.each(ROUTES)("%s rejects another admin's election with 403", async (_name, url) => {
    const test = await appWithTwoAdmins();
    await givenOpenElection(test);

    const response = await post(test, test.asBia, url, BODY);

    expect(response.statusCode).toBe(FORBIDDEN);
  });
});
