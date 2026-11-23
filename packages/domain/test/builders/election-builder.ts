import type { Candidate, Election, ElectionStatus, Position, Round, Voter } from '../../src/index';
import { FIXED_NOW, secondsAfter } from './fixed-context';

// Test data builders: escondem os campos irrelevantes para cada teste. Os valores que
// importam para um teste devem ser passados explicitamente nele.

const DEFAULT_ROUND_SECONDS = 60;

/**
 * Cria um cargo `PENDING` válido, permitindo sobrescrever qualquer campo.
 *
 * @param overrides - Campos que o teste quer fixar.
 * @returns Um `Position`.
 */
export function aPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'president',
    title: 'President',
    tiebreak: 'OLDEST',
    status: 'PENDING',
    ...overrides,
  };
}

/**
 * Cria um candidato válido. Se `applications` for informado sem `firstChoicePositionId`,
 * a primeira opção passa a ser o primeiro cargo da lista.
 *
 * @param overrides - Campos que o teste quer fixar.
 * @returns Um `Candidate`.
 */
export function aCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const applications = overrides.applications ?? ['president'];
  return {
    id: 'ana',
    name: 'Ana',
    age: 22,
    remainingMonths: 24,
    firstChoicePositionId: applications[0] ?? 'president',
    createdAt: FIXED_NOW.toISOString(),
    ...overrides,
    applications,
  };
}

/**
 * Cria um eleitor credenciado.
 *
 * @param overrides - Campos que o teste quer fixar.
 * @returns Um `Voter`.
 */
export function aVoter(overrides: Partial<Voter> = {}): Voter {
  return { id: 'voter-1', code: 'ABCD2345', status: 'CREDENTIALED', ...overrides };
}

/**
 * Cria uma rodada aberta de 1º turno, aberta em `FIXED_NOW` com prazo de 60 s.
 *
 * @param overrides - Campos que o teste quer fixar.
 * @returns Um `Round`.
 */
export function aRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    positionId: 'president',
    kind: 'FIRST',
    candidateIds: [],
    eligibleVoterIds: [],
    votedVoterIds: [],
    tally: {},
    openedAt: FIXED_NOW.toISOString(),
    deadline: secondsAfter(FIXED_NOW, DEFAULT_ROUND_SECONDS).toISOString(),
    status: 'OPEN',
    resultsReleased: false,
    ...overrides,
  };
}

/** Builder fluente de eleições para testes (`anElection().withPositions(...).build()`). */
export class ElectionBuilder {
  private status: ElectionStatus = 'DRAFT';
  private positions: Position[] = [];
  private candidates: Candidate[] = [];
  private voters: Voter[] = [];
  private rounds: Round[] = [];
  private queue: string[] | undefined;

  /**
   * Define o estado da eleição.
   *
   * @param status - Estado desejado.
   * @returns O próprio builder.
   */
  withStatus(status: ElectionStatus): this {
    this.status = status;
    return this;
  }

  /**
   * Atalho para uma eleição já aberta para votação.
   *
   * @returns O próprio builder.
   */
  open(): this {
    return this.withStatus('OPEN');
  }

  /**
   * Adiciona cargos; sem `withQueue`, a fila é a ordem dos cargos `PENDING`.
   *
   * @param positions - Cargos a adicionar.
   * @returns O próprio builder.
   */
  withPositions(...positions: Position[]): this {
    this.positions.push(...positions);
    return this;
  }

  /**
   * Adiciona candidatos.
   *
   * @param candidates - Candidatos a adicionar.
   * @returns O próprio builder.
   */
  withCandidates(...candidates: Candidate[]): this {
    this.candidates.push(...candidates);
    return this;
  }

  /**
   * Adiciona eleitores.
   *
   * @param voters - Eleitores a adicionar.
   * @returns O próprio builder.
   */
  withVoters(...voters: Voter[]): this {
    this.voters.push(...voters);
    return this;
  }

  /**
   * Adiciona rodadas.
   *
   * @param rounds - Rodadas a adicionar.
   * @returns O próprio builder.
   */
  withRounds(...rounds: Round[]): this {
    this.rounds.push(...rounds);
    return this;
  }

  /**
   * Fixa a fila de votação explicitamente.
   *
   * @param positionIds - Ids dos cargos, na ordem de votação.
   * @returns O próprio builder.
   */
  withQueue(...positionIds: string[]): this {
    this.queue = positionIds;
    return this;
  }

  /**
   * Monta o agregado.
   *
   * @returns Uma `Election` com os dados configurados.
   */
  build(): Election {
    const pendingIds = this.positions.filter((p) => p.status === 'PENDING').map((p) => p.id);
    return {
      id: 'election-1',
      adminId: 'admin-1',
      name: 'Student Union 2027',
      status: this.status,
      defaultVotingSeconds: DEFAULT_ROUND_SECONDS,
      positions: [...this.positions],
      queue: this.queue ?? pendingIds,
      candidates: [...this.candidates],
      voters: [...this.voters],
      rounds: [...this.rounds],
      version: 0,
    };
  }
}

/**
 * Começa um builder de eleição em `DRAFT`, sem cargos, candidatos, eleitores ou rodadas.
 *
 * @returns Um novo `ElectionBuilder`.
 */
export function anElection(): ElectionBuilder {
  return new ElectionBuilder();
}
