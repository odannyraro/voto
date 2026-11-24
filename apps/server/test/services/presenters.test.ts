import {
  castVote,
  closeRound,
  openRound,
  pushSnapshot,
  releaseResults,
  type DomainContext,
} from '@voto/domain';
import type { Election } from '@voto/shared';
import { describe, expect, it } from 'vitest';
import type { ElectionRecord } from '../../src/ports';
import { toAdminElectionDTO, toVoterStateDTO } from '../../src/services/presenters';
import { openElectionWithVoters } from '../support/election-fixtures';
import { unwrap } from '../support/election-records';

const NOW = new Date('2026-01-01T12:00:00.000Z');
const ONE_MINUTE_SECONDS = 60;
const ROUND_ID = 'round-1';
const ANY_HISTORY_LIMIT = 10;
const ctx: DomainContext = { now: NOW, newId: () => ROUND_ID };

/**
 * Eleição aberta com a rodada de 1 min do cargo `president` em andamento (candidato único
 * `president-candidate`) e os eleitores `e1:ANA-CODE` e `e1:BIA-CODE`.
 *
 * @returns A eleição com a rodada `ROUND_ID` aberta em `NOW`.
 */
function electionWithOpenRound(): Election {
  const { current } = openElectionWithVoters({
    id: 'e1',
    positionIds: ['president'],
    voterCodes: ['ANA-CODE', 'BIA-CODE'],
  });
  return unwrap(
    openRound(current, { positionId: 'president', durationSeconds: ONE_MINUTE_SECONDS }, ctx),
  );
}

/**
 * Eleição de `electionWithOpenRound` depois de um voto na rodada aberta.
 *
 * @param vote - Quem votou e em quem.
 * @returns A eleição com o voto registrado.
 */
function electionWithVote(vote: { voterId: string; choice: string }): Election {
  return unwrap(castVote(electionWithOpenRound(), { roundId: ROUND_ID, ...vote }, ctx));
}

/**
 * Embrulha uma eleição num registro sem histórico, que é o que o apresentador do admin recebe.
 *
 * @param election - Eleição atual.
 * @returns O registro, sem estados anteriores.
 */
function recordOf(election: Election): ElectionRecord {
  return { current: election, past: [] };
}

describe('toAdminElectionDTO', () => {
  it('reports the server clock as serverNow', () => {
    const { current } = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });

    const dto = toAdminElectionDTO(recordOf(current), NOW);

    expect(dto.serverNow).toBe('2026-01-01T12:00:00.000Z');
  });

  it('cannot undo when there is no history', () => {
    const { current } = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });

    const dto = toAdminElectionDTO(recordOf(current), NOW);

    expect(dto.canUndo).toBe(false);
  });

  it('can undo when there is a previous state', () => {
    const { current } = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });
    const withHistory = pushSnapshot(recordOf(current), current, ANY_HISTORY_LIMIT);

    const dto = toAdminElectionDTO(withHistory, NOW);

    expect(dto.canUndo).toBe(true);
  });

  it('tells the admin which position is ready to be voted next', () => {
    const { current } = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });

    const dto = toAdminElectionDTO(recordOf(current), NOW);

    expect(dto.next).toEqual({ status: 'READY', positionId: 'president' });
  });

  it('has no current round and no last result before any round is opened', () => {
    const { current } = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });

    const dto = toAdminElectionDTO(recordOf(current), NOW);

    expect(dto).not.toHaveProperty('currentRound');
    expect(dto).not.toHaveProperty('lastResult');
  });

  describe('with an open round', () => {
    it('shows the ballot with the deadline', () => {
      const dto = toAdminElectionDTO(recordOf(electionWithOpenRound()), NOW);

      expect(dto.currentRound).toMatchObject({
        roundId: ROUND_ID,
        positionTitle: 'president',
        kind: 'FIRST',
        candidates: [{ id: 'president-candidate', name: 'Candidate for president' }],
        deadline: '2026-01-01T12:01:00.000Z',
      });
    });

    it('falls back to the ids when the round points to a missing position or candidate', () => {
      const inconsistent = { ...electionWithOpenRound(), positions: [], candidates: [] };

      const dto = toAdminElectionDTO(recordOf(inconsistent), NOW);

      expect(dto.currentRound).toMatchObject({
        positionTitle: 'president',
        candidates: [{ id: 'president-candidate', name: 'president-candidate' }],
      });
    });

    it('starts the voting progress at zero of all eligible voters', () => {
      const dto = toAdminElectionDTO(recordOf(electionWithOpenRound()), NOW);

      expect(dto.currentRound).toMatchObject({ votedCount: 0, eligibleCount: 2 });
    });

    it('counts a voter who already voted in the progress', () => {
      const voted = electionWithVote({ voterId: 'e1:ANA-CODE', choice: 'president-candidate' });

      const dto = toAdminElectionDTO(recordOf(voted), NOW);

      expect(dto.currentRound).toMatchObject({ votedCount: 1, eligibleCount: 2 });
    });

    it('does not reveal the partial tally to the admin', () => {
      const voted = electionWithVote({ voterId: 'e1:ANA-CODE', choice: 'president-candidate' });

      const dto = toAdminElectionDTO(recordOf(voted), NOW);

      expect(dto.currentRound).not.toHaveProperty('tally');
      expect(dto).not.toHaveProperty('lastResult');
    });
  });

  describe('with a closed round that was not released to the voters', () => {
    it('shows the result to the admin', () => {
      const voted = electionWithVote({ voterId: 'e1:ANA-CODE', choice: 'president-candidate' });
      const closed = unwrap(closeRound(voted, ROUND_ID));

      const dto = toAdminElectionDTO(recordOf(closed), NOW);

      expect(dto.lastResult).toMatchObject({
        roundId: ROUND_ID,
        positionTitle: 'president',
        validVotes: 1,
        outcome: 'ELECTED',
      });
      expect(dto).not.toHaveProperty('currentRound');
    });
  });
});

describe('toVoterStateDTO', () => {
  it('reports the server clock as serverNow', () => {
    const election = electionWithOpenRound();

    const dto = toVoterStateDTO(election, 'e1:ANA-CODE', NOW);

    expect(dto.serverNow).toBe('2026-01-01T12:00:00.000Z');
  });

  it('waits when no round is open', () => {
    const { current } = openElectionWithVoters({ id: 'e1', positionIds: ['president'] });

    const dto = toVoterStateDTO(current, 'e1:VOTER1', NOW);

    expect(dto).toEqual({
      phase: 'WAITING',
      electionName: 'Board election',
      serverNow: '2026-01-01T12:00:00.000Z',
    });
  });

  it('shows only the ballot, with no voter codes and no tally, while voting', () => {
    const election = electionWithOpenRound();

    const dto = toVoterStateDTO(election, 'e1:ANA-CODE', NOW);

    // `toEqual` exato: qualquer campo extra (código, contagem) faria o teste falhar.
    expect(dto).toEqual({
      phase: 'VOTING',
      round: {
        roundId: ROUND_ID,
        positionTitle: 'president',
        kind: 'FIRST',
        candidates: [{ id: 'president-candidate', name: 'Candidate for president' }],
        deadline: '2026-01-01T12:01:00.000Z',
      },
      serverNow: '2026-01-01T12:00:00.000Z',
    });
  });

  it('shows each voter their own state: voted for one, still voting for the other', () => {
    const voted = electionWithVote({ voterId: 'e1:ANA-CODE', choice: 'president-candidate' });

    const ana = toVoterStateDTO(voted, 'e1:ANA-CODE', NOW);
    const bia = toVoterStateDTO(voted, 'e1:BIA-CODE', NOW);

    expect(ana).toMatchObject({ phase: 'VOTED', roundId: ROUND_ID });
    expect(bia).toMatchObject({ phase: 'VOTING' });
  });

  it('hides the vote count while the closed round is not released', () => {
    const voted = electionWithVote({ voterId: 'e1:ANA-CODE', choice: 'president-candidate' });
    const closed = unwrap(closeRound(voted, ROUND_ID));

    const dto = toVoterStateDTO(closed, 'e1:ANA-CODE', NOW);

    expect(dto).toEqual({
      phase: 'WAITING',
      electionName: 'Board election',
      serverNow: '2026-01-01T12:00:00.000Z',
    });
  });

  it('shows the result once it is released', () => {
    const voted = electionWithVote({ voterId: 'e1:ANA-CODE', choice: 'president-candidate' });
    const released = unwrap(releaseResults(unwrap(closeRound(voted, ROUND_ID)), ROUND_ID));

    const dto = toVoterStateDTO(released, 'e1:ANA-CODE', NOW);

    expect(dto).toMatchObject({
      phase: 'RESULTS',
      result: { roundId: ROUND_ID, validVotes: 1, outcome: 'ELECTED' },
    });
  });
});
