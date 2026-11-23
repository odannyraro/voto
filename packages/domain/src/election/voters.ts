import type { CodeGenerator, DomainContext } from '../context';
import type { Election, Voter } from '../model';
import { fail, ok, type Result } from '../result';
import { requireNotFinished } from './guards';

const MAX_VOTERS_PER_BATCH = 500;

/** Pedido de credenciamento de eleitores. */
export interface CredentialVotersInput {
  /** Quantos códigos gerar, de 1 a 500. */
  readonly count: number;
  /** Rótulos opcionais (ex.: "Mesa 3"), dados aos novos eleitores na ordem. */
  readonly labels?: readonly string[];
}

/** Eleição com os novos eleitores e os códigos gerados, para o admin distribuir. */
export interface CredentialedVoters {
  readonly election: Election;
  readonly codes: readonly string[];
}

/**
 * Credencia N eleitores, cada um com um código vindo do gerador injetado. O domínio só
 * garante a unicidade dentro da eleição; a unicidade global fica com o servidor.
 *
 * @param election - Eleição em `DRAFT` ou `OPEN`.
 * @param input - Quantidade e rótulos opcionais.
 * @param codeGenerator - Fonte dos códigos (no servidor, já checados contra o banco).
 * @param ctx - Contexto do comando; fornece os ids dos eleitores.
 * @returns A eleição e os códigos novos, ou `ELECTION_FINISHED`, `INVALID_VOTER_COUNT`,
 *   `INVALID_VOTER_LABELS` ou `DUPLICATE_VOTER_CODE`.
 */
export function credentialVoters(
  election: Election,
  input: CredentialVotersInput,
  codeGenerator: CodeGenerator,
  ctx: DomainContext,
): Result<CredentialedVoters> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const invalid = validateRequest(input);
  if (invalid) return invalid;

  const usedCodes = new Set(election.voters.map((voter) => voter.code));
  const newVoters: Voter[] = [];
  for (let index = 0; index < input.count; index += 1) {
    const code = codeGenerator.generate();
    if (usedCodes.has(code))
      return fail('DUPLICATE_VOTER_CODE', 'The code generator repeated a code');
    usedCodes.add(code);
    newVoters.push(buildVoter(ctx.newId(), code, input.labels?.[index]));
  }

  const updated = { ...election, voters: [...election.voters, ...newVoters] };
  return ok({ election: updated, codes: newVoters.map((voter) => voter.code) });
}

/**
 * Revoga o código de um eleitor: ele deixa de poder entrar e votar nas próximas rodadas.
 *
 * @param election - Eleição atual.
 * @param voterId - Id do eleitor.
 * @returns A eleição alterada, ou `ELECTION_FINISHED`, `VOTER_NOT_FOUND` ou `VOTER_REVOKED`
 *   (código já revogado).
 */
export function revokeVoter(election: Election, voterId: string): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const voter = election.voters.find((candidate) => candidate.id === voterId);
  if (!voter) return fail('VOTER_NOT_FOUND', `Voter ${voterId} does not exist`);
  if (voter.status === 'REVOKED')
    return fail('VOTER_REVOKED', 'This voter code was already revoked');

  return ok({
    ...election,
    voters: election.voters.map((v) => (v.id === voterId ? { ...v, status: 'REVOKED' } : v)),
  });
}

/**
 * Confere a quantidade pedida e os rótulos.
 *
 * @param input - Pedido de credenciamento.
 * @returns `INVALID_VOTER_COUNT` ou `INVALID_VOTER_LABELS`; ou `undefined`.
 */
function validateRequest(input: CredentialVotersInput): Result<never> | undefined {
  const isValidCount =
    Number.isInteger(input.count) && input.count >= 1 && input.count <= MAX_VOTERS_PER_BATCH;
  if (!isValidCount) {
    return fail(
      'INVALID_VOTER_COUNT',
      `Voter count must be a whole number from 1 to ${MAX_VOTERS_PER_BATCH}`,
    );
  }
  if ((input.labels?.length ?? 0) > input.count) {
    return fail('INVALID_VOTER_LABELS', 'There are more labels than voters');
  }
  return undefined;
}

/**
 * Monta um eleitor credenciado, incluindo o rótulo só quando houver um.
 *
 * @param id - Id do eleitor.
 * @param code - Código de acesso.
 * @param label - Rótulo opcional.
 * @returns O eleitor novo.
 */
function buildVoter(id: string, code: string, label: string | undefined): Voter {
  const voter: Voter = { id, code, status: 'CREDENTIALED' };
  return label === undefined ? voter : { ...voter, label };
}
