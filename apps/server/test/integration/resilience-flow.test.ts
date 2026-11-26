import type { AdminElectionDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import {
  adminCall,
  adminView,
  appWithAdminAna,
  castVote,
  castVotes,
  createMayorRace,
  credentialVotersAndOpen,
  logIn,
  OK,
  openRound,
  releaseResults,
  startVoterSessions,
  voterState,
  type AuthHeaders,
  type Race,
} from '../support/http-election-steps';
import type { TestApp } from '../support/make-test-app';

const VOTER_CODES = ['ABCD2345', 'WXYZ6789'] as const;

/** Eleição aberta com a rodada de Mayor aberta e dois eleitores com sessão. */
interface OpenMayorRound {
  readonly test: TestApp;
  readonly admin: AuthHeaders;
  readonly race: Race;
  readonly roundId: string;
  readonly voters: readonly [AuthHeaders, AuthHeaders];
}

/**
 * Cria a disputa de Mayor (Ana e Bia), credencia dois eleitores, abre a eleição e a rodada.
 *
 * @returns O app, a admin, os ids, a rodada e os eleitores.
 */
async function openMayorRound(): Promise<OpenMayorRound> {
  const test = await appWithAdminAna(VOTER_CODES);
  const admin = await logIn(test);
  const race = await createMayorRace(test, admin);
  await credentialVotersAndOpen(test, admin, {
    electionId: race.electionId,
    count: VOTER_CODES.length,
  });
  const voters = await startVoterSessions(test, VOTER_CODES);
  const roundId = await openRound(test, admin, race);
  return { test, admin, race, roundId, voters };
}

/**
 * O admin desfaz o seu último passo.
 *
 * @param scenario - App, admin e eleição.
 * @returns O estado da eleição depois de desfazer.
 */
function undo(scenario: OpenMayorRound): Promise<AdminElectionDTO> {
  return adminCall(scenario.test, {
    method: 'POST',
    url: `/api/elections/${scenario.race.electionId}/undo`,
    headers: scenario.admin,
    status: OK,
  });
}

/**
 * Os dois eleitores votam em Ana, que é eleita, e o admin libera o resultado.
 *
 * @param scenario - Rodada de Mayor aberta.
 */
async function electAnaAndRelease(scenario: OpenMayorRound): Promise<void> {
  const { test, admin, race, roundId } = scenario;
  const [firstVoter, secondVoter] = scenario.voters;
  await castVotes(test, roundId, [
    [firstVoter, race.anaId],
    [secondVoter, race.anaId],
  ]);
  await releaseResults(test, admin, { electionId: race.electionId, roundId });
}

/**
 * O admin anula a rodada de Mayor.
 *
 * @param scenario - App, admin, eleição e rodada.
 * @returns O estado da eleição depois da anulação.
 */
function annulMayorRound(scenario: OpenMayorRound): Promise<AdminElectionDTO> {
  return adminCall(scenario.test, {
    method: 'POST',
    url: `/api/elections/${scenario.race.electionId}/rounds/${scenario.roundId}/annul`,
    headers: scenario.admin,
    status: OK,
  });
}

describe('undo and annul over HTTP', () => {
  it('hides the result from voters again when the admin undoes its release', async () => {
    const scenario = await openMayorRound();
    await electAnaAndRelease(scenario);

    await undo(scenario);

    expect(await voterState(scenario.test, scenario.voters[0])).toMatchObject({
      phase: 'WAITING',
    });
  });

  it('keeps the result visible to the admin after undoing its release', async () => {
    const scenario = await openMayorRound();
    await electAnaAndRelease(scenario);

    const undone = await undo(scenario);

    expect(undone.lastResult).toMatchObject({
      outcome: 'ELECTED',
      electedCandidateId: scenario.race.anaId,
    });
  });

  it('discards the votes cast in a round when the admin undoes its opening', async () => {
    const scenario = await openMayorRound();
    const { test, race, roundId } = scenario;
    await castVote(test, scenario.voters[0], { roundId, choice: race.biaId });

    const undone = await undo(scenario);

    expect(undone.election.rounds).toEqual([]);
  });

  it('returns an annulled position to the top of the queue so its vote can be held again', async () => {
    const scenario = await openMayorRound();
    const { test, race, roundId } = scenario;
    const [firstVoter, secondVoter] = scenario.voters;
    // Empate 1 a 1: o desempate OLDEST elege Ana, e a anulação tem de desfazer isso.
    await castVotes(test, roundId, [
      [firstVoter, race.anaId],
      [secondVoter, race.biaId],
    ]);

    const annulled = await annulMayorRound(scenario);

    expect(annulled.election.positions).toContainEqual({
      id: race.positionId,
      title: 'Mayor',
      tiebreak: 'OLDEST',
      status: 'PENDING',
    });
    expect(annulled.next).toEqual({ status: 'READY', positionId: race.positionId });
  });

  it('lets voters vote again in the round opened after an annulment', async () => {
    const scenario = await openMayorRound();
    const { test, admin, race, roundId } = scenario;
    const [firstVoter, secondVoter] = scenario.voters;
    await castVotes(test, roundId, [
      [firstVoter, race.anaId],
      [secondVoter, race.biaId],
    ]);
    await annulMayorRound(scenario);
    const newRoundId = await openRound(test, admin, race);

    await castVote(test, firstVoter, { roundId: newRoundId, choice: race.biaId });

    const dto = await adminView(test, admin, race.electionId);
    expect(dto.currentRound).toMatchObject({ roundId: newRoundId, votedCount: 1 });
  });
});
