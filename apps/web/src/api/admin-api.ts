import {
  type AdminElectionDTO,
  type CancelPositionBody,
  type CreateCandidateBody,
  type CreateElectionBody,
  type CreatePositionBody,
  type CredentialVotersBody,
  type ElectionSummaryDTO,
  type LoginBody,
  type OpenRoundBody,
  type OpenRunoffBody,
  type QueueBody,
  type UpdateCandidateBody,
  type UpdateElectionBody,
  type UpdatePositionBody,
} from '@voto/shared';
import { apiRequestWithBody } from './api-client';

type ElectionMutation = {
  readonly token: string;
  readonly electionId: string;
};

type PositionMutation = ElectionMutation & {
  readonly positionId: string;
};

type CandidateMutation = ElectionMutation & {
  readonly candidateId: string;
};

type RoundMutation = ElectionMutation & {
  readonly roundId: string;
};

/**
 * Encodes an election identifier as one path segment.
 *
 * @param electionId - Identifier supplied by the API consumer.
 * @returns URL-safe path segment.
 */
function electionPath(electionId: string): `/${string}` {
  return `/elections/${encodeURIComponent(electionId)}`;
}

/**
 * REST operations for administrator authentication, election setup, and election control.
 */
export const adminApi = {
  /**
   * Authenticates an administrator.
   *
   * @param body - Username and password from the login form.
   * @returns The administrator session token.
   */
  login(body: LoginBody): Promise<{ readonly token: string }> {
    return apiRequestWithBody('/admin/login', { method: 'POST', body });
  },

  /**
   * Returns the identity associated with an administrator session.
   *
   * @param token - Bearer token for the administrator session.
   * @returns Administrator identifier and username.
   */
  getMe(token: string): Promise<{ readonly id: string; readonly username: string }> {
    return apiRequestWithBody('/admin/me', { token });
  },

  /**
   * Lists elections available to the authenticated administrator.
   *
   * @param token - Bearer token for the administrator session.
   * @returns Summaries of the administrator's elections.
   */
  listElections(token: string): Promise<readonly ElectionSummaryDTO[]> {
    return apiRequestWithBody('/elections', { token });
  },

  /**
   * Creates an election.
   *
   * @param token - Bearer token for the administrator session.
   * @param body - Election name and optional default voting duration.
   * @returns The created election state.
   */
  createElection(token: string, body: CreateElectionBody): Promise<AdminElectionDTO> {
    return apiRequestWithBody('/elections', { token, method: 'POST', body });
  },

  /**
   * Loads the complete state of an election.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election to load.
   * @returns The complete election state.
   */
  getElection(token: string, electionId: string): Promise<AdminElectionDTO> {
    return apiRequestWithBody(electionPath(electionId), { token });
  },

  /**
   * Updates an election's editable settings.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election to update.
   * @param body - Partial election settings.
   * @returns The updated election state.
   */
  updateElection(
    token: string,
    electionId: string,
    body: UpdateElectionBody,
  ): Promise<AdminElectionDTO> {
    return apiRequestWithBody(electionPath(electionId), { token, method: 'PATCH', body });
  },

  /**
   * Adds a position to an election.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @param body - Position title and tie-break rule.
   * @returns The updated election state.
   */
  createPosition(
    token: string,
    electionId: string,
    body: CreatePositionBody,
  ): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/positions`, {
      token,
      method: 'POST',
      body,
    });
  },

  /**
   * Updates a position's editable settings.
   *
   * @param mutation - Session token, election and position identifiers, and partial position data.
   * @returns The updated election state.
   */
  updatePosition(
    mutation: PositionMutation & { readonly body: UpdatePositionBody },
  ): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/positions/${encodeURIComponent(mutation.positionId)}`;
    return apiRequestWithBody(endpoint, {
      token: mutation.token,
      method: 'PATCH',
      body: mutation.body,
    });
  },

  /**
   * Removes a position from an election.
   *
   * @param mutation - Session token and election and position identifiers.
   * @returns The updated election state.
   */
  deletePosition(mutation: PositionMutation): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/positions/${encodeURIComponent(mutation.positionId)}`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'DELETE' });
  },

  /**
   * Replaces the order in which pending positions are voted on.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @param body - Position identifiers in the requested order.
   * @returns The updated election state.
   */
  updateQueue(token: string, electionId: string, body: QueueBody): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/queue`, { token, method: 'PUT', body });
  },

  /**
   * Returns the server's suggested order for the election queue.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @returns Suggested position identifiers in order.
   */
  getQueueSuggestion(
    token: string,
    electionId: string,
  ): Promise<{ readonly positionIds: readonly string[] }> {
    return apiRequestWithBody(`${electionPath(electionId)}/queue/suggestion`, { token });
  },

  /**
   * Creates a candidate and their initial applications.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @param body - Candidate details and applications.
   * @returns The updated election state.
   */
  createCandidate(
    token: string,
    electionId: string,
    body: CreateCandidateBody,
  ): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/candidates`, {
      token,
      method: 'POST',
      body,
    });
  },

  /**
   * Updates candidate details or applications.
   *
   * @param mutation - Session token, election and candidate identifiers, and partial candidate data.
   * @returns The updated election state.
   */
  updateCandidate(
    mutation: CandidateMutation & { readonly body: UpdateCandidateBody },
  ): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/candidates/${encodeURIComponent(mutation.candidateId)}`;
    return apiRequestWithBody(endpoint, {
      token: mutation.token,
      method: 'PATCH',
      body: mutation.body,
    });
  },

  /**
   * Removes a candidate from the election.
   *
   * @param mutation - Session token and election and candidate identifiers.
   * @returns The updated election state.
   */
  deleteCandidate(mutation: CandidateMutation): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/candidates/${encodeURIComponent(mutation.candidateId)}`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'DELETE' });
  },

  /**
   * Attaches an existing candidate to a position.
   *
   * @param mutation - Session token and election, position, and candidate identifiers.
   * @returns The updated election state.
   */
  attachCandidate(
    mutation: PositionMutation & { readonly candidateId: string },
  ): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/positions/${encodeURIComponent(mutation.positionId)}/candidates/${encodeURIComponent(mutation.candidateId)}`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'POST' });
  },

  /**
   * Generates voter credentials for an election.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @param body - Number of credentials and optional labels.
   * @returns Generated codes and the updated election state.
   */
  credentialVoters(
    token: string,
    electionId: string,
    body: CredentialVotersBody,
  ): Promise<{ readonly codes: readonly string[]; readonly election: AdminElectionDTO }> {
    return apiRequestWithBody(`${electionPath(electionId)}/voters`, {
      token,
      method: 'POST',
      body,
    });
  },

  /**
   * Revokes a voter's credential.
   *
   * @param mutation - Session token and election and voter identifiers.
   * @returns The updated election state.
   */
  revokeVoter(
    mutation: ElectionMutation & { readonly voterId: string },
  ): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/voters/${encodeURIComponent(mutation.voterId)}`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'DELETE' });
  },

  /**
   * Opens an election for voting.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election to open.
   * @returns The updated election state.
   */
  openElection(token: string, electionId: string): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/open`, { token, method: 'POST' });
  },

  /**
   * Returns the next position and its readiness status.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @returns Next-position status and any attachable candidates.
   */
  getNextPosition(token: string, electionId: string): Promise<AdminElectionDTO['next']> {
    return apiRequestWithBody(`${electionPath(electionId)}/next`, { token });
  },

  /**
   * Defers the current position in the voting queue.
   *
   * @param mutation - Session token and election and position identifiers.
   * @returns The updated election state.
   */
  deferPosition(mutation: PositionMutation): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/positions/${encodeURIComponent(mutation.positionId)}/defer`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'POST' });
  },

  /**
   * Cancels a position after confirming its title.
   *
   * @param mutation - Session token, election and position identifiers, and confirmation title.
   * @returns The updated election state.
   */
  cancelPosition(
    mutation: PositionMutation & { readonly body: CancelPositionBody },
  ): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/positions/${encodeURIComponent(mutation.positionId)}/cancel`;
    return apiRequestWithBody(endpoint, {
      token: mutation.token,
      method: 'POST',
      body: mutation.body,
    });
  },

  /**
   * Opens a first-round vote for a position.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @param body - Position identifier and optional voting duration.
   * @returns The updated election state.
   */
  openRound(token: string, electionId: string, body: OpenRoundBody): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/rounds`, {
      token,
      method: 'POST',
      body,
    });
  },

  /**
   * Closes an open voting round.
   *
   * @param mutation - Session token and election and round identifiers.
   * @returns The updated election state.
   */
  closeRound(mutation: RoundMutation): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/rounds/${encodeURIComponent(mutation.roundId)}/close`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'POST' });
  },

  /**
   * Opens the runoff for a position.
   *
   * @param mutation - Session token, election and position identifiers, and optional duration body.
   * @returns The updated election state.
   */
  openRunoff(
    mutation: PositionMutation & { readonly body: OpenRunoffBody },
  ): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/positions/${encodeURIComponent(mutation.positionId)}/runoff`;
    return apiRequestWithBody(endpoint, {
      token: mutation.token,
      method: 'POST',
      body: mutation.body,
    });
  },

  /**
   * Releases the closed round's result to voters.
   *
   * @param mutation - Session token and election and round identifiers.
   * @returns The updated election state.
   */
  releaseRound(mutation: RoundMutation): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/rounds/${encodeURIComponent(mutation.roundId)}/release`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'POST' });
  },

  /**
   * Annuls a closed voting round.
   *
   * @param mutation - Session token and election and round identifiers.
   * @returns The updated election state.
   */
  annulRound(mutation: RoundMutation): Promise<AdminElectionDTO> {
    const endpoint: `/${string}` = `${electionPath(mutation.electionId)}/rounds/${encodeURIComponent(mutation.roundId)}/annul`;
    return apiRequestWithBody(endpoint, { token: mutation.token, method: 'POST' });
  },

  /**
   * Reverts the most recent election mutation.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election.
   * @returns The updated election state.
   */
  undoElection(token: string, electionId: string): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/undo`, { token, method: 'POST' });
  },

  /**
   * Finishes an election.
   *
   * @param token - Bearer token for the administrator session.
   * @param electionId - Identifier of the election to finish.
   * @returns The updated election state.
   */
  finishElection(token: string, electionId: string): Promise<AdminElectionDTO> {
    return apiRequestWithBody(`${electionPath(electionId)}/finish`, { token, method: 'POST' });
  },
};
