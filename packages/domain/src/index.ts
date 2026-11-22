// API pública do domínio: o único ponto de entrada do pacote (architecture.md §5.2).
export * from './model';
export { DOMAIN_ERROR_CODES, DomainError, type DomainErrorCode } from './errors';
export { ok, fail, type Result } from './result';
export type { DomainContext, CodeGenerator } from './context';
export {
  createElection,
  updateElection,
  DEFAULT_VOTING_SECONDS,
  type CreateElectionInput,
  type UpdateElectionInput,
} from './election/election';
export {
  addPosition,
  updatePosition,
  removePosition,
  type AddPositionInput,
  type UpdatePositionInput,
} from './election/positions';
export {
  addCandidate,
  updateCandidate,
  removeCandidate,
  type AddCandidateInput,
  type UpdateCandidateInput,
} from './election/candidates';
export {
  credentialVoters,
  revokeVoter,
  type CredentialVotersInput,
  type CredentialedVoters,
} from './election/voters';
export { CODE_ALPHABET, CODE_LENGTH, createCodeGenerator, type RandomIndexSource } from './voters/code';
export { eligibleCandidates, attachableCandidates, attachExistingCandidate } from './eligibility/eligibility';
export { rankByTiebreak } from './tiebreak/tiebreak';
export {
  computeResult,
  type RoundResult,
  type RoundOutcome,
  type CandidateCount,
} from './tally/compute-result';
export { openElection, openRound, type OpenRoundInput } from './election/rounds';
export { castVote, type CastVoteInput } from './election/vote';
export { closeRound, closeRoundIfDue } from './election/close';
export { openRunoff } from './election/runoff';
export {
  releaseResults,
  lastResultView,
  voterView,
  type BallotView,
  type RoundResultView,
  type VoterView,
} from './views/views';
export { nextPositionStatus, applyOrder, type NextPositionInfo } from './ordering/queue';
export { deferPosition, cancelPosition } from './election/position-actions';
export { suggestOrder } from './ordering/suggest';
