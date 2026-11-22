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
