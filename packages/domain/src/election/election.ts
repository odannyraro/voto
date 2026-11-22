import type { DomainContext } from '../context';
import type { Election } from '../model';
import { fail, ok, type Result } from '../result';
import { validateVotingSeconds } from './guards';

/** Prazo padrão de uma rodada quando o admin não informa outro, em segundos. */
export const DEFAULT_VOTING_SECONDS = 60;

/** Dados para criar uma eleição. */
export interface CreateElectionInput {
  readonly adminId: string;
  readonly name: string;
  /** Prazo padrão das rodadas; se omitido, usa `DEFAULT_VOTING_SECONDS`. */
  readonly defaultVotingSeconds?: number;
}

/** Campos editáveis da eleição; os omitidos ficam como estão. */
export interface UpdateElectionInput {
  readonly name?: string;
  readonly defaultVotingSeconds?: number;
}

/**
 * Cria uma eleição vazia em `DRAFT`, pronta para o admin configurar cargos,
 * candidatos e eleitores.
 *
 * @param input - Dono, nome e prazo padrão opcional das rodadas.
 * @param ctx - Contexto do comando; fornece o id da eleição.
 * @returns A eleição nova, ou `INVALID_ELECTION_NAME` (nome vazio) ou
 *   `INVALID_VOTING_DURATION` (prazo fora de 5 a 3600 s ou não inteiro).
 */
export function createElection(input: CreateElectionInput, ctx: DomainContext): Result<Election> {
  const name = input.name.trim();
  if (name === '') return fail('INVALID_ELECTION_NAME', 'Election name must not be blank');

  const seconds = input.defaultVotingSeconds ?? DEFAULT_VOTING_SECONDS;
  const durationError = validateVotingSeconds(seconds);
  if (durationError) return durationError;

  return ok({
    id: ctx.newId(),
    adminId: input.adminId,
    name,
    status: 'DRAFT',
    defaultVotingSeconds: seconds,
    positions: [],
    queue: [],
    candidates: [],
    voters: [],
    rounds: [],
    version: 0,
  });
}

/**
 * Edita o nome e o prazo padrão da eleição. Permitido até a eleição ser encerrada.
 *
 * @param election - Eleição atual.
 * @param input - Campos a alterar.
 * @returns A eleição alterada, ou `ELECTION_FINISHED`, `INVALID_ELECTION_NAME` ou
 *   `INVALID_VOTING_DURATION`.
 */
export function updateElection(election: Election, input: UpdateElectionInput): Result<Election> {
  if (election.status === 'FINISHED') {
    return fail('ELECTION_FINISHED', 'A finished election cannot be changed');
  }

  const name = input.name?.trim() ?? election.name;
  if (name === '') return fail('INVALID_ELECTION_NAME', 'Election name must not be blank');

  const seconds = input.defaultVotingSeconds ?? election.defaultVotingSeconds;
  const durationError = validateVotingSeconds(seconds);
  if (durationError) return durationError;

  return ok({ ...election, name, defaultVotingSeconds: seconds });
}
