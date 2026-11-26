import { describe, expect, it } from 'vitest';
import {
  addCandidate,
  addPosition,
  appWithAdminAna,
  castVotes,
  createElection,
  credentialVotersAndOpen,
  logIn,
  openRound,
  startVoterSessions,
  voterState,
} from '../support/http-election-steps';

const VOTER_CODES = ['ABCD2345', 'WXYZ6789', 'HJKM3456'] as const;

describe('elected candidate exclusion over HTTP', () => {
  it('leaves the candidate elected as mayor off the treasurer ballot', async () => {
    const test = await appWithAdminAna(VOTER_CODES);
    const admin = await logIn(test);
    const electionId = await createElection(test, admin, 'Student Union 2027');
    const mayorId = await addPosition(test, admin, { electionId, title: 'Mayor' });
    const treasurerId = await addPosition(test, admin, { electionId, title: 'Treasurer' });
    const anaId = await addCandidate(test, admin, {
      electionId,
      name: 'Ana',
      applications: [mayorId, treasurerId],
    });
    await addCandidate(test, admin, { electionId, name: 'Bia', applications: [mayorId] });
    const caioId = await addCandidate(test, admin, {
      electionId,
      name: 'Caio',
      applications: [treasurerId],
    });
    await credentialVotersAndOpen(test, admin, { electionId, count: VOTER_CODES.length });
    const [v1, v2, v3] = await startVoterSessions(test, VOTER_CODES);
    const mayorRoundId = await openRound(test, admin, { electionId, positionId: mayorId });
    await castVotes(test, mayorRoundId, [
      [v1, anaId],
      [v2, anaId],
      [v3, anaId],
    ]);

    await openRound(test, admin, { electionId, positionId: treasurerId });

    expect(await voterState(test, v1)).toMatchObject({
      phase: 'VOTING',
      round: { positionTitle: 'Treasurer', candidates: [{ id: caioId, name: 'Caio' }] },
    });
  });
});
