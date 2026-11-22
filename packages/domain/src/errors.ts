// Catálogo de códigos de erro do domínio. O servidor traduz cada código para um status
// HTTP (architecture.md §6.3): `*_NOT_FOUND` → 404, `ROUND_EXPIRED` → 410, demais → 409.
// Quando a S0.3a criar `ERROR_CODES` em `@voto/shared`, estes códigos precisam estar lá.

/** Códigos estáveis dos erros esperados do domínio. */
export const DOMAIN_ERROR_CODES = [
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

/** Um dos códigos de `DOMAIN_ERROR_CODES`. */
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/**
 * Erro esperado de uma regra de negócio. O domínio o devolve dentro de um `Result`
 * (não lança); o servidor pode lançá-lo na borda para virar resposta HTTP.
 */
export class DomainError extends Error {
  /** Código estável usado pelo servidor e pelo front para identificar o erro. */
  readonly code: DomainErrorCode;

  /**
   * Cria o erro com um código do catálogo e uma mensagem legível.
   *
   * @param code - Código estável do catálogo `DOMAIN_ERROR_CODES`.
   * @param message - Explicação para pessoas (logs e respostas da API), em inglês.
   */
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
