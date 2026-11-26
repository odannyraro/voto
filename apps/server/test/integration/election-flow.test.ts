import { describe, expect, it } from 'vitest';
import {
  adminView,
  appWithAdminAna,
  castVote,
  createMayorRace,
  credentialVotersAndOpen,
  logIn,
  openRound,
  releaseResults,
  startVoterSessions,
  voterState,
} from '../support/http-election-steps';

const VOTER_CODES = ['ABCD2345', 'WXYZ6789', 'HJKM3456'] as const;

describe('full election over HTTP', () => {
  it('runs a single-position election from login to released results', async () => {
    const test = await appWithAdminAna(VOTER_CODES);
    const admin = await logIn(test);
    const race = await createMayorRace(test, admin);
    await credentialVotersAndOpen(test, admin, {
      electionId: race.electionId,
      count: VOTER_CODES.length,
    });
    const [firstVoter, secondVoter, thirdVoter] = await startVoterSessions(test, VOTER_CODES);
    const roundId = await openRound(test, admin, race);

    await castVote(test, firstVoter, { roundId, choice: race.anaId });
    await castVote(test, secondVoter, { roundId, choice: race.anaId });
    await castVote(test, thirdVoter, { roundId, choice: race.biaId });

    // O último voto fecha a rodada sozinho; o admin já vê o resultado, o eleitor ainda não.
    const afterVotes = await adminView(test, admin, race.electionId);
    expect(afterVotes.currentRound).toBeUndefined();
    expect(afterVotes.lastResult).toMatchObject({
      outcome: 'ELECTED',
      electedCandidateId: race.anaId,
    });
    expect(await voterState(test, firstVoter)).toMatchObject({ phase: 'WAITING' });

    await releaseResults(test, admin, { electionId: race.electionId, roundId });
    expect(await voterState(test, thirdVoter)).toMatchObject({
      phase: 'RESULTS',
      result: { outcome: 'ELECTED', electedCandidateId: race.anaId, validVotes: 3 },
    });
  });
});
