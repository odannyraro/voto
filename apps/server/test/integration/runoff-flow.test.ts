import { describe, expect, it } from 'vitest';
import {
  addCandidate,
  addPosition,
  adminCall,
  adminView,
  appWithAdminAna,
  castVotes,
  createElection,
  credentialVotersAndOpen,
  CREATED,
  logIn,
  openRound,
  startVoterSessions,
  voterState,
  type AuthHeaders,
  type VoterHeaders,
} from '../support/http-election-steps';
import type { TestApp } from '../support/make-test-app';

// Cinco eleitores: dá para dividir os votos 2-2-1 sem empate e decidir o 2º turno por 3 a 2.
const VOTER_CODES = ['ABCD2345', 'WXYZ6789', 'HJKM3456', 'NPQR4567', 'STUV5678'] as const;

/** Eleição aberta com o cargo Mayor disputado por Ana, Bia e Caio. */
interface ThreeWayRace {
  readonly electionId: string;
  readonly positionId: string;
  readonly anaId: string;
  readonly biaId: string;
  readonly caioId: string;
}

/**
 * Cria e abre a eleição com três candidatos a Mayor e os cinco eleitores credenciados.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @returns Os ids da eleição, do cargo e dos candidatos.
 */
async function openThreeWayMayorRace(test: TestApp, admin: AuthHeaders): Promise<ThreeWayRace> {
  const electionId = await createElection(test, admin, 'Student Union 2027');
  const positionId = await addPosition(test, admin, { electionId, title: 'Mayor' });
  const applications = [positionId];
  const anaId = await addCandidate(test, admin, { electionId, name: 'Ana', applications });
  const biaId = await addCandidate(test, admin, { electionId, name: 'Bia', applications });
  const caioId = await addCandidate(test, admin, { electionId, name: 'Caio', applications });
  await credentialVotersAndOpen(test, admin, { electionId, count: VOTER_CODES.length });
  return { electionId, positionId, anaId, biaId, caioId };
}

/**
 * O admin abre o 2º turno do cargo.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param race - Eleição e cargo aguardando o 2º turno.
 * @returns O id da rodada do 2º turno.
 */
async function openRunoff(test: TestApp, admin: AuthHeaders, race: ThreeWayRace): Promise<string> {
  const opened = await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${race.electionId}/positions/${race.positionId}/runoff`,
    headers: admin,
    status: CREATED,
  });
  return opened.currentRound?.roundId ?? 'missing';
}

/** 1º turno já apurado com 2 votos para Ana, 2 para Bia e 1 para Caio. */
interface AwaitingRunoff {
  readonly test: TestApp;
  readonly admin: AuthHeaders;
  readonly race: ThreeWayRace;
  readonly voters: VoterHeaders<typeof VOTER_CODES>;
}

/**
 * Leva o cargo Mayor ao 2º turno: o 1º turno termina 2-2-1, sem ninguém com mais da metade.
 *
 * @returns O app, a admin, a disputa e os cinco eleitores com sessão.
 */
async function splitFirstRound(): Promise<AwaitingRunoff> {
  const test = await appWithAdminAna(VOTER_CODES);
  const admin = await logIn(test);
  const race = await openThreeWayMayorRace(test, admin);
  const voters = await startVoterSessions(test, VOTER_CODES);
  const [v1, v2, v3, v4, v5] = voters;
  const roundId = await openRound(test, admin, race);
  await castVotes(test, roundId, [
    [v1, race.anaId],
    [v2, race.anaId],
    [v3, race.biaId],
    [v4, race.biaId],
    [v5, race.caioId],
  ]);
  return { test, admin, race, voters };
}

describe('runoff over HTTP', () => {
  it('sends the two most voted to a runoff when nobody has more than half of the valid votes', async () => {
    const test = await appWithAdminAna(VOTER_CODES);
    const admin = await logIn(test);
    const race = await openThreeWayMayorRace(test, admin);
    const [v1, v2, v3, v4, v5] = await startVoterSessions(test, VOTER_CODES);
    const roundId = await openRound(test, admin, race);

    await castVotes(test, roundId, [
      [v1, race.anaId],
      [v2, race.anaId],
      [v3, race.biaId],
      [v4, race.biaId],
      [v5, race.caioId],
    ]);

    const dto = await adminView(test, admin, race.electionId);
    expect(dto.lastResult).toMatchObject({
      outcome: 'RUNOFF_REQUIRED',
      runoffCandidateIds: [race.anaId, race.biaId],
    });
    expect(dto.next).toEqual({ status: 'AWAITING_RUNOFF', positionId: race.positionId });
  });

  it('puts only the two finalists on the runoff ballot', async () => {
    const { test, admin, race, voters } = await splitFirstRound();
    const caioVoter = voters[4];

    await openRunoff(test, admin, race);

    expect(await voterState(test, caioVoter)).toMatchObject({
      phase: 'VOTING',
      round: {
        kind: 'RUNOFF',
        candidates: [
          { id: race.anaId, name: 'Ana' },
          { id: race.biaId, name: 'Bia' },
        ],
      },
    });
  });

  it('elects the most voted finalist in the runoff and decides the position', async () => {
    const { test, admin, race, voters } = await splitFirstRound();
    const [v1, v2, v3, v4, v5] = voters;
    const runoffId = await openRunoff(test, admin, race);

    // O eleitor de Caio desempata o 2º turno a favor de Bia.
    await castVotes(test, runoffId, [
      [v1, race.anaId],
      [v2, race.anaId],
      [v3, race.biaId],
      [v4, race.biaId],
      [v5, race.biaId],
    ]);

    const dto = await adminView(test, admin, race.electionId);
    expect(dto.election.positions).toContainEqual(
      expect.objectContaining({
        id: race.positionId,
        status: 'DECIDED',
        electedCandidateId: race.biaId,
      }),
    );
  });
});
