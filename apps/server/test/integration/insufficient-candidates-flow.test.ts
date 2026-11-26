import type { AdminElectionDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import {
  addCandidate,
  addPosition,
  adminCall,
  appWithAdminAna,
  castVotes,
  createElection,
  credentialVotersAndOpen,
  logIn,
  nextStep,
  OK,
  openRound,
  startVoterSessions,
  voterState,
  type AuthHeaders,
} from '../support/http-election-steps';
import type { TestApp } from '../support/make-test-app';

const VOTER_CODES = ['ABCD2345', 'WXYZ6789'] as const;

/** Eleição em que Treasurer ficou sem candidatos aptos depois da eleição de Mayor. */
interface EmptiedTreasurer {
  readonly test: TestApp;
  readonly admin: AuthHeaders;
  readonly electionId: string;
  readonly treasurerId: string;
  readonly secretaryId: string;
  readonly biaId: string;
  readonly caioId: string;
  /** Um eleitor com sessão aberta, para ver a cédula. */
  readonly voter: AuthHeaders;
}

/**
 * Monta a fila Mayor → Treasurer → Secretary e elege Ana para Mayor. Ana era a única
 * candidata a Treasurer, que fica no topo da fila sem ninguém apto; Bia (só Mayor) e Caio
 * (só Secretary) continuam disponíveis para serem anexados.
 *
 * @returns O app, a admin, os ids relevantes e um eleitor.
 */
async function electAnaLeavingTreasurerEmpty(): Promise<EmptiedTreasurer> {
  const test = await appWithAdminAna(VOTER_CODES);
  const admin = await logIn(test);
  const electionId = await createElection(test, admin, 'Student Union 2027');
  const mayorId = await addPosition(test, admin, { electionId, title: 'Mayor' });
  const treasurerId = await addPosition(test, admin, { electionId, title: 'Treasurer' });
  const secretaryId = await addPosition(test, admin, { electionId, title: 'Secretary' });
  const anaId = await addCandidate(test, admin, {
    electionId,
    name: 'Ana',
    applications: [mayorId, treasurerId],
  });
  const biaId = await addCandidate(test, admin, {
    electionId,
    name: 'Bia',
    applications: [mayorId],
  });
  const caioId = await addCandidate(test, admin, {
    electionId,
    name: 'Caio',
    applications: [secretaryId],
  });
  await credentialVotersAndOpen(test, admin, { electionId, count: VOTER_CODES.length });
  const [voter, otherVoter] = await startVoterSessions(test, VOTER_CODES);
  const mayorRoundId = await openRound(test, admin, { electionId, positionId: mayorId });
  await castVotes(test, mayorRoundId, [
    [voter, anaId],
    [otherVoter, anaId],
  ]);
  return { test, admin, electionId, treasurerId, secretaryId, biaId, caioId, voter };
}

/**
 * Faz um `POST` de admin sobre o cargo Treasurer (anexar, adiar ou cancelar).
 *
 * @param scenario - Cenário montado por `electAnaLeavingTreasurerEmpty`.
 * @param action - Trecho da rota depois de `/positions/:pid/`.
 * @param payload - Corpo, se a ação pedir um.
 * @returns O estado da eleição depois da ação.
 */
function onTreasurer(
  scenario: EmptiedTreasurer,
  action: string,
  payload?: object,
): Promise<AdminElectionDTO> {
  const { test, admin, electionId, treasurerId } = scenario;
  return adminCall(test, {
    method: 'POST',
    url: `/api/elections/${electionId}/positions/${treasurerId}/${action}`,
    headers: admin,
    ...(payload ? { payload } : {}),
    status: OK,
  });
}

describe('insufficient candidates over HTTP', () => {
  it('reports the position left without eligible candidates and the ones that can be attached', async () => {
    const scenario = await electAnaLeavingTreasurerEmpty();

    const next = await nextStep(scenario.test, scenario.admin, scenario.electionId);

    expect(next).toEqual({
      status: 'INSUFFICIENT_CANDIDATES',
      positionId: scenario.treasurerId,
      attachableCandidates: [
        { id: scenario.biaId, name: 'Bia' },
        { id: scenario.caioId, name: 'Caio' },
      ],
    });
  });

  it('puts an attached existing candidate on the ballot of the emptied position', async () => {
    const scenario = await electAnaLeavingTreasurerEmpty();
    const { test, admin, electionId, treasurerId } = scenario;

    await onTreasurer(scenario, `candidates/${scenario.biaId}`);
    await openRound(test, admin, { electionId, positionId: treasurerId });

    expect(await voterState(test, scenario.voter)).toMatchObject({
      phase: 'VOTING',
      round: { positionTitle: 'Treasurer', candidates: [{ id: scenario.biaId, name: 'Bia' }] },
    });
  });

  it('moves a deferred position to the end of the queue so the next one is ready', async () => {
    const scenario = await electAnaLeavingTreasurerEmpty();

    const deferred = await onTreasurer(scenario, 'defer');

    expect(deferred.election.queue).toEqual([scenario.secretaryId, scenario.treasurerId]);
    expect(deferred.next).toEqual({ status: 'READY', positionId: scenario.secretaryId });
  });

  it('takes a position cancelled with its exact title out of the queue', async () => {
    const scenario = await electAnaLeavingTreasurerEmpty();

    const cancelled = await onTreasurer(scenario, 'cancel', { confirmTitle: 'Treasurer' });

    expect(cancelled.election.positions).toContainEqual(
      expect.objectContaining({ id: scenario.treasurerId, status: 'CANCELLED' }),
    );
    expect(cancelled.election.queue).toEqual([scenario.secretaryId]);
  });
});
