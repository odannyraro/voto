import { openRound } from '@voto/domain';
import { SOCKET_EVENTS, type VoterStateDTO } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import type { ElectionRecord } from '../../src/ports';
import { toAdminElectionDTO } from '../../src/services/presenters';
import { ANA, BIA } from '../support/admin-test-app';
import { draftElectionWithPositions, openElectionWithVoters } from '../support/election-fixtures';
import { unwrap } from '../support/election-records';
import {
  collectEvents,
  connected,
  startRealtimeApp,
  waitForConnectError,
  waitForEvent,
  type RealtimeTestApp,
} from '../support/realtime-test-app';

const FIRST_CODE = 'ABCD2345';
const SECOND_CODE = 'WXYZ6789';
const FIRST_VOTER_ID = `e1:${FIRST_CODE}`;
const SECOND_VOTER_ID = `e1:${SECOND_CODE}`;
const ROUND_OPENED_AT = new Date('2026-01-01T12:00:00.000Z');

/** Eleição `e1` da Ana, aberta, com dois eleitores e sem rodada. */
const anasOpenElection = (): ElectionRecord =>
  openElectionWithVoters({
    id: 'e1',
    adminId: ANA,
    positionIds: ['mayor'],
    voterCodes: [FIRST_CODE, SECOND_CODE],
  });

/** Eleição `e1` da Ana com a rodada `r1` de `mayor` aberta e ninguém tendo votado. */
const anasElectionWithOpenRound = (): ElectionRecord => {
  const { current } = anasOpenElection();
  const opened = unwrap(
    openRound(current, { positionId: 'mayor' }, { now: ROUND_OPENED_AT, newId: () => 'r1' }),
  );
  return { current: opened, past: [] };
};

/**
 * Estado de eleitor fácil de reconhecer no teste.
 *
 * @param electionName - Texto que identifica o estado.
 * @returns Um estado `WAITING` com esse nome.
 */
const waitingState = (electionName: string): VoterStateDTO => ({
  phase: 'WAITING',
  electionName,
  serverNow: ROUND_OPENED_AT.toISOString(),
});

/**
 * Conecta um eleitor de `e1` com um token emitido pelo app.
 *
 * @param test - App de teste.
 * @param voterId - Eleitor dono do token.
 * @returns O cliente conectado.
 */
async function connectVoter(test: RealtimeTestApp, voterId: string) {
  const token = await test.auth.issueVoterToken({ electionId: 'e1', voterId });
  return connected(test.connect(token));
}

/**
 * Conecta um admin com um token emitido pelo app.
 *
 * @param test - App de teste.
 * @param adminId - Admin dono do token.
 * @returns O cliente conectado.
 */
async function connectAdmin(test: RealtimeTestApp, adminId: string) {
  return connected(test.connect(await test.auth.issueAdminToken(adminId)));
}

describe('realtime gateway', () => {
  describe('handshake', () => {
    it('refuses a connection without a token', async () => {
      const test = await startRealtimeApp();

      const error = await waitForConnectError(test.connect());

      expect(error.message).toBe('INVALID_TOKEN');
    });

    it('refuses a connection with an invalid token', async () => {
      const test = await startRealtimeApp();

      const error = await waitForConnectError(test.connect('not-a-jwt'));

      expect(error.message).toBe('INVALID_TOKEN');
    });
  });

  describe('admin:watch', () => {
    it('sends the current state right away to the admin who owns the election', async () => {
      const test = await startRealtimeApp();
      await test.deps.electionRepository.create(anasOpenElection());
      const ana = await connectAdmin(test, ANA);

      const state = waitForEvent(ana, SOCKET_EVENTS.ADMIN_STATE);
      ana.emit(SOCKET_EVENTS.ADMIN_WATCH, { electionId: 'e1' });

      await expect(state).resolves.toMatchObject({ election: { id: 'e1', status: 'OPEN' } });
    });

    it("does not let an admin follow another admin's election", async () => {
      const test = await startRealtimeApp();
      const anas = anasOpenElection();
      await test.deps.electionRepository.create(anas);
      await test.deps.electionRepository.create(
        draftElectionWithPositions({ id: 'e2', adminId: BIA, positionIds: ['mayor'] }),
      );
      const bia = await connectAdmin(test, BIA);
      const received = collectEvents(bia, SOCKET_EVENTS.ADMIN_STATE);
      bia.emit(SOCKET_EVENTS.ADMIN_WATCH, { electionId: 'e1' });
      const ownState = waitForEvent(bia, SOCKET_EVENTS.ADMIN_STATE);
      bia.emit(SOCKET_EVENTS.ADMIN_WATCH, { electionId: 'e2' });
      const own = await ownState;

      // O estado de e2 serve de sentinela: se Bia estivesse na sala de e1, o de e1 chegaria antes.
      test.socketNotifier.adminState('e1', toAdminElectionDTO(anas, ROUND_OPENED_AT));
      const sentinel = waitForEvent(bia, SOCKET_EVENTS.ADMIN_STATE);
      test.socketNotifier.adminState('e2', own);
      await sentinel;

      expect(received.map((state) => state.election.id)).toEqual(['e2', 'e2']);
    });

    it('ignores a malformed watch request and keeps serving the socket', async () => {
      const test = await startRealtimeApp();
      await test.deps.electionRepository.create(anasOpenElection());
      const ana = await connectAdmin(test, ANA);
      const malformed = null as unknown as { electionId: string };

      ana.emit(SOCKET_EVENTS.ADMIN_WATCH, malformed);
      const state = waitForEvent(ana, SOCKET_EVENTS.ADMIN_STATE);
      ana.emit(SOCKET_EVENTS.ADMIN_WATCH, { electionId: 'e1' });

      await expect(state).resolves.toMatchObject({ election: { id: 'e1' } });
    });
  });

  describe('SocketNotifier', () => {
    it('delivers a voter state only to that voter', async () => {
      const test = await startRealtimeApp();
      await connectVoter(test, FIRST_VOTER_ID);
      const second = await connectVoter(test, SECOND_VOTER_ID);
      const receivedBySecond = collectEvents(second, SOCKET_EVENTS.VOTER_STATE);

      test.socketNotifier.voterState(FIRST_VOTER_ID, waitingState('for the first voter'));
      // Sentinela: na mesma conexão, um estado indevido chegaria antes deste.
      const sentinel = waitForEvent(second, SOCKET_EVENTS.VOTER_STATE);
      test.socketNotifier.voterState(SECOND_VOTER_ID, waitingState('for the second voter'));
      await sentinel;

      expect(receivedBySecond).toEqual([waitingState('for the second voter')]);
    });

    it('delivers a voter state to the voter it is addressed to', async () => {
      const test = await startRealtimeApp();
      const first = await connectVoter(test, FIRST_VOTER_ID);

      const state = waitForEvent(first, SOCKET_EVENTS.VOTER_STATE);
      test.socketNotifier.voterState(FIRST_VOTER_ID, waitingState('for the first voter'));

      await expect(state).resolves.toEqual(waitingState('for the first voter'));
    });
  });

  describe('a vote cast over HTTP', () => {
    it('pushes the new progress to the admin watching the election', async () => {
      const test = await startRealtimeApp();
      await test.deps.electionRepository.create(anasElectionWithOpenRound());
      const ana = await connectAdmin(test, ANA);
      const initial = waitForEvent(ana, SOCKET_EVENTS.ADMIN_STATE);
      ana.emit(SOCKET_EVENTS.ADMIN_WATCH, { electionId: 'e1' });
      await initial;
      const voterToken = await test.auth.issueVoterToken({
        electionId: 'e1',
        voterId: FIRST_VOTER_ID,
      });

      const afterVote = waitForEvent(ana, SOCKET_EVENTS.ADMIN_STATE);
      await test.app.inject({
        method: 'POST',
        url: '/api/voter/votes',
        headers: { authorization: `Bearer ${voterToken}` },
        payload: { roundId: 'r1', choice: 'mayor-candidate' },
      });

      await expect(afterVote).resolves.toMatchObject({
        currentRound: { votedCount: 1, eligibleCount: 2 },
      });
    });

    it('pushes the VOTED state to the voter who cast it', async () => {
      const test = await startRealtimeApp();
      await test.deps.electionRepository.create(anasElectionWithOpenRound());
      const voterToken = await test.auth.issueVoterToken({
        electionId: 'e1',
        voterId: FIRST_VOTER_ID,
      });
      const voter = await connected(test.connect(voterToken));

      const afterVote = waitForEvent(voter, SOCKET_EVENTS.VOTER_STATE);
      await test.app.inject({
        method: 'POST',
        url: '/api/voter/votes',
        headers: { authorization: `Bearer ${voterToken}` },
        payload: { roundId: 'r1', choice: 'mayor-candidate' },
      });

      await expect(afterVote).resolves.toMatchObject({ phase: 'VOTED', roundId: 'r1' });
    });
  });
});
