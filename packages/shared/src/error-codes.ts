/**
 * Códigos dos erros esperados do domínio. É uma cópia de `DOMAIN_ERROR_CODES`
 * (`packages/domain/src/errors.ts`): o `shared` não pode importar o domínio, e um teste do
 * servidor (S0.4) garante que as duas listas não se descolem.
 */
const DOMAIN_CODES = [
  'INVALID_ELECTION_NAME',
  'INVALID_VOTING_DURATION',
  'ELECTION_NOT_DRAFT',
  'ELECTION_NOT_OPEN',
  'ELECTION_FINISHED',
  'NO_POSITIONS',
  'POSITION_NOT_FOUND',
  'INVALID_POSITION_TITLE',
  'DUPLICATE_POSITION_TITLE',
  'INVALID_TIEBREAK_RULE',
  'POSITION_HAS_CANDIDATES',
  'POSITION_NOT_PENDING',
  'POSITION_NOT_AWAITING_RUNOFF',
  'CONFIRMATION_MISMATCH',
  'INVALID_QUEUE_ORDER',
  'CANDIDATE_NOT_FOUND',
  'INVALID_CANDIDATE_NAME',
  'INVALID_CANDIDATE_AGE',
  'INVALID_REMAINING_MONTHS',
  'INVALID_APPLICATIONS',
  'INVALID_FIRST_CHOICE',
  'CANDIDATE_ALREADY_ELECTED',
  'CANDIDATE_ON_BALLOT',
  'INVALID_VOTER_COUNT',
  'INVALID_VOTER_LABELS',
  'DUPLICATE_VOTER_CODE',
  'VOTER_NOT_FOUND',
  'VOTER_REVOKED',
  'NO_CREDENTIALED_VOTERS',
  'NO_ELIGIBLE_CANDIDATES',
  'ROUND_IN_PROGRESS',
  'RUNOFF_PENDING',
  'ROUND_NOT_FOUND',
  'ROUND_NOT_OPEN',
  'ROUND_NOT_CLOSED',
  'ROUND_NOT_LATEST',
  'ROUND_EXPIRED',
  'VOTER_NOT_ELIGIBLE',
  'VOTER_ALREADY_VOTED',
  'INVALID_CHOICE',
  'NOTHING_TO_UNDO',
] as const;

/** Códigos de erros que só a camada HTTP do servidor produz (architecture.md §6.3). */
const SERVER_CODES = [
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'INVALID_TOKEN',
  'FORBIDDEN',
  'ELECTION_NOT_FOUND',
  'INVALID_CODE',
  'VERSION_CONFLICT',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
] as const;

/** Todos os códigos de erro que a API pode devolver: os do domínio e os do servidor. */
export const ERROR_CODES = [...DOMAIN_CODES, ...SERVER_CODES] as const;

/** Um dos códigos de `ERROR_CODES`. */
export type ErrorCode = (typeof ERROR_CODES)[number];
