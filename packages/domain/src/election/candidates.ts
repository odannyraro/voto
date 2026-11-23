import type { DomainContext } from '../context';
import type { Candidate, Election } from '../model';
import { fail, ok, type Result } from '../result';
import { requireNotFinished } from './guards';
import { findCandidate, findOpenRound, findPosition, isElected, replaceCandidate } from './lookup';

const MIN_CANDIDATE_AGE = 16;
const MAX_CANDIDATE_AGE = 120;

/** Dados de cadastro de um candidato. */
export interface AddCandidateInput {
  readonly name: string;
  /** Anos completos, de 16 a 120. */
  readonly age: number;
  /** Meses restantes na universidade; inteiro ≥ 0. */
  readonly remainingMonths: number;
  /** Cargos a que concorre; ao menos um, sem repetição. */
  readonly applications: readonly string[];
  /** Precisa estar em `applications`. */
  readonly firstChoicePositionId: string;
}

/** Campos editáveis de um candidato; os omitidos ficam como estão. */
export type UpdateCandidateInput = Partial<AddCandidateInput>;

/** Campos de um candidato que passam pela validação de cadastro. */
type CandidateFields = Omit<Candidate, 'id' | 'createdAt'>;

/**
 * Cadastra um candidato. Permitido também com a eleição aberta, porque o README pede
 * que o admin possa criar candidatos quando um cargo fica sem concorrentes.
 *
 * @param election - Eleição em `DRAFT` ou `OPEN`.
 * @param input - Dados do candidato.
 * @param ctx - Contexto do comando; fornece o id e o instante de cadastro.
 * @returns A eleição com o candidato, ou `ELECTION_FINISHED`, `INVALID_CANDIDATE_NAME`,
 *   `INVALID_CANDIDATE_AGE`, `INVALID_REMAINING_MONTHS`, `INVALID_APPLICATIONS`,
 *   `POSITION_NOT_FOUND` ou `INVALID_FIRST_CHOICE`.
 */
export function addCandidate(
  election: Election,
  input: AddCandidateInput,
  ctx: DomainContext,
): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const fields: CandidateFields = { ...input, name: input.name.trim() };
  const invalid = validateCandidate(election, fields);
  if (invalid) return invalid;

  const candidate: Candidate = { ...fields, id: ctx.newId(), createdAt: ctx.now.toISOString() };
  return ok({ ...election, candidates: [...election.candidates, candidate] });
}

/**
 * Edita os dados de um candidato que ainda não foi eleito. Um eleito fica congelado,
 * para que o resultado registrado não mude depois.
 *
 * @param election - Eleição atual.
 * @param candidateId - Id do candidato.
 * @param input - Campos a alterar.
 * @returns A eleição alterada, ou `ELECTION_FINISHED`, `CANDIDATE_NOT_FOUND`,
 *   `CANDIDATE_ALREADY_ELECTED` ou os mesmos erros de validação de `addCandidate`.
 */
export function updateCandidate(
  election: Election,
  candidateId: string,
  input: UpdateCandidateInput,
): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const candidate = findCandidate(election, candidateId);
  if (!candidate) return fail('CANDIDATE_NOT_FOUND', `Candidate ${candidateId} does not exist`);
  if (isElected(election, candidateId)) {
    return fail('CANDIDATE_ALREADY_ELECTED', 'An elected candidate cannot be changed');
  }

  const updated: Candidate = {
    ...candidate,
    ...input,
    name: (input.name ?? candidate.name).trim(),
  };
  const invalid = validateCandidate(election, updated);
  if (invalid) return invalid;

  return ok(replaceCandidate(election, updated));
}

/**
 * Remove um candidato que não foi eleito e que não está na cédula da rodada aberta.
 *
 * @param election - Eleição atual.
 * @param candidateId - Id do candidato.
 * @returns A eleição sem o candidato, ou `ELECTION_FINISHED`, `CANDIDATE_NOT_FOUND`,
 *   `CANDIDATE_ALREADY_ELECTED` ou `CANDIDATE_ON_BALLOT`.
 */
export function removeCandidate(election: Election, candidateId: string): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  if (!findCandidate(election, candidateId)) {
    return fail('CANDIDATE_NOT_FOUND', `Candidate ${candidateId} does not exist`);
  }
  if (isElected(election, candidateId)) {
    return fail('CANDIDATE_ALREADY_ELECTED', 'An elected candidate cannot be removed');
  }
  if (findOpenRound(election)?.candidateIds.includes(candidateId)) {
    return fail('CANDIDATE_ON_BALLOT', 'The candidate is on the ballot of the open round');
  }

  return ok({ ...election, candidates: election.candidates.filter((c) => c.id !== candidateId) });
}

/**
 * Valida os dados pessoais e as candidaturas de um candidato.
 *
 * @param election - Eleição com os cargos existentes.
 * @param fields - Dados do candidato, com o nome já sem espaços nas pontas.
 * @returns O `Result` de falha do primeiro problema encontrado, ou `undefined`.
 */
function validateCandidate(election: Election, fields: CandidateFields): Result<never> | undefined {
  if (fields.name === '') return fail('INVALID_CANDIDATE_NAME', 'Candidate name must not be blank');

  const isValidAge =
    Number.isInteger(fields.age) &&
    fields.age >= MIN_CANDIDATE_AGE &&
    fields.age <= MAX_CANDIDATE_AGE;
  if (!isValidAge) {
    return fail(
      'INVALID_CANDIDATE_AGE',
      `Age must be a whole number from ${MIN_CANDIDATE_AGE} to ${MAX_CANDIDATE_AGE}`,
    );
  }
  if (!Number.isInteger(fields.remainingMonths) || fields.remainingMonths < 0) {
    return fail(
      'INVALID_REMAINING_MONTHS',
      'Remaining months must be a whole number of at least 0',
    );
  }
  return validateApplications(election, fields.applications, fields.firstChoicePositionId);
}

/**
 * Valida a lista de cargos a que o candidato concorre e a primeira opção.
 *
 * @param election - Eleição com os cargos existentes.
 * @param applications - Ids dos cargos escolhidos.
 * @param firstChoicePositionId - Cargo marcado como primeira opção.
 * @returns `INVALID_APPLICATIONS`, `POSITION_NOT_FOUND` ou `INVALID_FIRST_CHOICE`; ou `undefined`.
 */
function validateApplications(
  election: Election,
  applications: readonly string[],
  firstChoicePositionId: string,
): Result<never> | undefined {
  if (applications.length === 0 || new Set(applications).size !== applications.length) {
    return fail(
      'INVALID_APPLICATIONS',
      'A candidate must run for at least one position, each listed once',
    );
  }
  const unknownId = applications.find((positionId) => !findPosition(election, positionId));
  if (unknownId) return fail('POSITION_NOT_FOUND', `Position ${unknownId} does not exist`);

  if (!applications.includes(firstChoicePositionId)) {
    return fail('INVALID_FIRST_CHOICE', 'The first choice must be one of the applications');
  }
  return undefined;
}
