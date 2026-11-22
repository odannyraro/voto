import type { DomainContext } from '../context';
import { eligibleCandidates } from '../eligibility/eligibility';
import type { Election, Position, Round, RoundKind } from '../model';
import { fail, ok, type Result } from '../result';
import { requireOpen, validateVotingSeconds } from './guards';
import { findOpenRound, findPosition, replacePosition } from './lookup';

const MS_PER_SECOND = 1000;

/** Pedido de abertura de rodada (mesmo formato do corpo de `POST /rounds`). */
export interface OpenRoundInput {
  readonly positionId: string;
  /** Prazo desta rodada; se omitido, usa o prazo padrão da eleição. */
  readonly durationSeconds?: number;
}

/** Dados para iniciar uma rodada já validada (1º ou 2º turno). */
export interface StartRoundInput {
  readonly position: Position;
  readonly kind: RoundKind;
  readonly candidateIds: readonly string[];
  readonly durationSeconds: number;
}

/**
 * Abre a eleição para votação. A partir daqui os eleitores podem entrar com o código.
 *
 * @param election - Eleição em configuração.
 * @returns A eleição em `OPEN`, ou `ELECTION_NOT_DRAFT` (já aberta ou encerrada) ou
 *   `NO_POSITIONS` (nada para votar).
 */
export function openElection(election: Election): Result<Election> {
  if (election.status !== 'DRAFT') return fail('ELECTION_NOT_DRAFT', 'The election was already opened');
  if (election.positions.length === 0) return fail('NO_POSITIONS', 'Add at least one position before opening');
  return ok({ ...election, status: 'OPEN' });
}

/**
 * Abre o 1º turno de um cargo, no estilo Kahoot: a cédula (candidatos aptos) e os
 * eleitores credenciados ficam congelados, e o prazo vira um instante absoluto.
 *
 * @param election - Eleição aberta.
 * @param input - Cargo e prazo opcional.
 * @param ctx - Contexto do comando; fornece o id da rodada e o instante de abertura.
 * @returns A eleição com a rodada aberta e o cargo em `VOTING`, ou `ELECTION_NOT_OPEN`,
 *   `ROUND_IN_PROGRESS`, `RUNOFF_PENDING`, `POSITION_NOT_FOUND`, `POSITION_NOT_PENDING`,
 *   `INVALID_VOTING_DURATION`, `NO_ELIGIBLE_CANDIDATES` ou `NO_CREDENTIALED_VOTERS`.
 */
export function openRound(election: Election, input: OpenRoundInput, ctx: DomainContext): Result<Election> {
  const blocked = checkCanStartRound(election);
  if (blocked) return blocked;
  // Um 2º turno pendente precisa ser resolvido antes, senão um finalista poderia ser
  // eleito em outro cargo no meio do caminho.
  if (election.positions.some((p) => p.status === 'AWAITING_RUNOFF')) {
    return fail('RUNOFF_PENDING', 'Open or resolve the pending runoff first');
  }

  const position = findPosition(election, input.positionId);
  if (!position) return fail('POSITION_NOT_FOUND', `Position ${input.positionId} does not exist`);
  if (position.status !== 'PENDING') return fail('POSITION_NOT_PENDING', 'This position is not waiting to be voted');

  const candidateIds = eligibleCandidates(election, position.id).map((candidate) => candidate.id);
  if (candidateIds.length === 0) return fail('NO_ELIGIBLE_CANDIDATES', 'The position has no eligible candidates');

  const durationSeconds = input.durationSeconds ?? election.defaultVotingSeconds;
  return startRound(election, { position, kind: 'FIRST', candidateIds, durationSeconds }, ctx);
}

/**
 * Confere as condições comuns para abrir qualquer rodada: eleição aberta e nenhuma
 * outra rodada em andamento (§5.4: uma rodada aberta por vez).
 *
 * @param election - Eleição atual.
 * @returns `ELECTION_NOT_OPEN` ou `ROUND_IN_PROGRESS`; ou `undefined`.
 */
export function checkCanStartRound(election: Election): Result<never> | undefined {
  const notOpen = requireOpen(election);
  if (notOpen) return notOpen;
  if (findOpenRound(election)) return fail('ROUND_IN_PROGRESS', 'Another round is still open');
  return undefined;
}

/**
 * Cria a rodada com cédula e eleitores congelados, marca o cargo como `VOTING` e o tira
 * da fila. Compartilhado entre 1º e 2º turno.
 *
 * @param election - Eleição já validada para abrir a rodada.
 * @param input - Cargo, tipo, cédula e prazo.
 * @param ctx - Contexto do comando.
 * @returns A eleição com a rodada, ou `INVALID_VOTING_DURATION` ou `NO_CREDENTIALED_VOTERS`.
 */
export function startRound(election: Election, input: StartRoundInput, ctx: DomainContext): Result<Election> {
  const durationError = validateVotingSeconds(input.durationSeconds);
  if (durationError) return durationError;

  const eligibleVoterIds = election.voters.filter((v) => v.status === 'CREDENTIALED').map((v) => v.id);
  if (eligibleVoterIds.length === 0) return fail('NO_CREDENTIALED_VOTERS', 'Credential voters before opening a round');

  const round: Round = {
    id: ctx.newId(),
    positionId: input.position.id,
    kind: input.kind,
    candidateIds: [...input.candidateIds],
    eligibleVoterIds,
    votedVoterIds: [],
    tally: {},
    openedAt: ctx.now.toISOString(),
    deadline: new Date(ctx.now.getTime() + input.durationSeconds * MS_PER_SECOND).toISOString(),
    status: 'OPEN',
    resultsReleased: false,
  };
  const withPosition = replacePosition(election, { ...input.position, status: 'VOTING' });
  return ok({
    ...withPosition,
    rounds: [...election.rounds, round],
    queue: election.queue.filter((id) => id !== input.position.id),
  });
}
