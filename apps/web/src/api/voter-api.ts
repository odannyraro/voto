import { type CastVoteBody, type VoterSessionBody, type VoterStateDTO } from '@voto/shared';
import { apiRequest, apiRequestWithBody } from './api-client';

/**
 * REST operations for joining an election and casting a vote.
 */
export const voterApi = {
  /**
   * Exchanges a voter code for an election session.
   *
   * @param body - Access code entered by the voter.
   * @returns Session token and the joined election identity.
   */
  createSession(body: VoterSessionBody): Promise<{
    readonly token: string;
    readonly electionId: string;
    readonly electionName: string;
  }> {
    return apiRequestWithBody('/voter/session', { method: 'POST', body });
  },

  /**
   * Loads the state currently visible to a voter.
   *
   * @param token - Bearer token for the voter session.
   * @returns Current waiting, voting, voted, results, or finished state.
   */
  getState(token: string): Promise<VoterStateDTO> {
    return apiRequestWithBody('/voter/state', { token });
  },

  /**
   * Submits the voter's choice for the current round.
   *
   * @param token - Bearer token for the voter session.
   * @param body - Round identifier and candidate identifier or `BLANK`.
   * @returns Resolves when the server accepts the vote; the API responds with `204`.
   */
  async castVote(token: string, body: CastVoteBody): Promise<void> {
    await apiRequest<void>('/voter/votes', { token, method: 'POST', body });
  },
};
