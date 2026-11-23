import type { DomainContext } from '../context';
import type { Election, Position, TiebreakRule } from '../model';
import { fail, ok, type Result } from '../result';
import { requireDraft, requireNotFinished } from './guards';
import { findPosition, replacePosition } from './lookup';

const TIEBREAK_RULES: readonly TiebreakRule[] = ['YOUNGEST', 'OLDEST', 'MOST_REMAINING_TIME'];

/** Dados de um cargo novo. */
export interface AddPositionInput {
  readonly title: string;
  readonly tiebreak: TiebreakRule;
}

/** Campos editáveis de um cargo; os omitidos ficam como estão. */
export interface UpdatePositionInput {
  readonly title?: string;
  readonly tiebreak?: TiebreakRule;
}

/**
 * Cria um cargo `PENDING` e o coloca no fim da fila de votação. Só é permitido em
 * `DRAFT`, porque cargos novos durante a votação mudariam a fila combinada.
 *
 * @param election - Eleição em configuração.
 * @param input - Título e regra de desempate do cargo.
 * @param ctx - Contexto do comando; fornece o id do cargo.
 * @returns A eleição com o cargo novo, ou `ELECTION_NOT_DRAFT`, `INVALID_POSITION_TITLE`,
 *   `DUPLICATE_POSITION_TITLE` ou `INVALID_TIEBREAK_RULE`.
 */
export function addPosition(election: Election, input: AddPositionInput, ctx: DomainContext): Result<Election> {
  const notDraft = requireDraft(election);
  if (notDraft) return notDraft;

  const title = input.title.trim();
  const invalid = validatePosition(election, title, input.tiebreak, undefined);
  if (invalid) return invalid;

  const position: Position = { id: ctx.newId(), title, tiebreak: input.tiebreak, status: 'PENDING' };
  return ok({
    ...election,
    positions: [...election.positions, position],
    queue: [...election.queue, position.id],
  });
}

/**
 * Edita título ou regra de desempate de um cargo que ainda não foi votado.
 *
 * @param election - Eleição atual (em `DRAFT` ou `OPEN`).
 * @param positionId - Id do cargo.
 * @param input - Campos a alterar.
 * @returns A eleição alterada, ou `ELECTION_FINISHED`, `POSITION_NOT_FOUND`,
 *   `POSITION_NOT_PENDING`, `INVALID_POSITION_TITLE`, `DUPLICATE_POSITION_TITLE` ou
 *   `INVALID_TIEBREAK_RULE`.
 */
export function updatePosition(election: Election, positionId: string, input: UpdatePositionInput): Result<Election> {
  const finished = requireNotFinished(election);
  if (finished) return finished;

  const position = findPosition(election, positionId);
  if (!position) return fail('POSITION_NOT_FOUND', `Position ${positionId} does not exist`);
  if (position.status !== 'PENDING') {
    return fail('POSITION_NOT_PENDING', 'Only positions that were not voted yet can be edited');
  }

  const title = input.title?.trim() ?? position.title;
  const tiebreak = input.tiebreak ?? position.tiebreak;
  const invalid = validatePosition(election, title, tiebreak, positionId);
  if (invalid) return invalid;

  return ok(replacePosition(election, { ...position, title, tiebreak }));
}

/**
 * Remove um cargo da eleição e da fila. Só em `DRAFT` e só se nenhum candidato
 * concorre a ele, para não deixar candidaturas apontando para um cargo inexistente.
 *
 * @param election - Eleição em configuração.
 * @param positionId - Id do cargo.
 * @returns A eleição sem o cargo, ou `ELECTION_NOT_DRAFT`, `POSITION_NOT_FOUND` ou
 *   `POSITION_HAS_CANDIDATES`.
 */
export function removePosition(election: Election, positionId: string): Result<Election> {
  const notDraft = requireDraft(election);
  if (notDraft) return notDraft;

  if (!findPosition(election, positionId)) {
    return fail('POSITION_NOT_FOUND', `Position ${positionId} does not exist`);
  }
  if (election.candidates.some((candidate) => candidate.applications.includes(positionId))) {
    return fail('POSITION_HAS_CANDIDATES', 'Remove the candidates of this position first');
  }

  return ok({
    ...election,
    positions: election.positions.filter((position) => position.id !== positionId),
    queue: election.queue.filter((id) => id !== positionId),
  });
}

/**
 * Valida título (não vazio e único, sem diferenciar maiúsculas) e regra de desempate.
 *
 * @param election - Eleição com os cargos existentes.
 * @param title - Título já sem espaços nas pontas.
 * @param tiebreak - Regra de desempate informada.
 * @param ownId - Id do próprio cargo, quando é uma edição (ele não conta como duplicado).
 * @returns O `Result` de falha correspondente, ou `undefined` se estiver tudo certo.
 */
function validatePosition(
  election: Election,
  title: string,
  tiebreak: TiebreakRule,
  ownId: string | undefined,
): Result<never> | undefined {
  if (title === '') return fail('INVALID_POSITION_TITLE', 'Position title must not be blank');

  const normalized = title.toLowerCase();
  const isDuplicate = election.positions.some(
    (position) => position.id !== ownId && position.title.toLowerCase() === normalized,
  );
  if (isDuplicate) return fail('DUPLICATE_POSITION_TITLE', `There is already a position named ${title}`);

  if (!TIEBREAK_RULES.includes(tiebreak)) {
    return fail('INVALID_TIEBREAK_RULE', `Unknown tiebreak rule ${tiebreak}`);
  }
  return undefined;
}
