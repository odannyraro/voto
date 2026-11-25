import type {
  AdminElectionDTO,
  Election,
  ElectionSummaryDTO,
  ErrorCode,
  ErrorDTO,
  RoundResultDTO,
  RoundView,
  VoterStateDTO,
} from '@voto/shared';

const SERVER_NOW = '2026-01-01T12:00:00.000Z';

type VoterStateOptions =
  | { phase?: 'WAITING'; electionName?: string; serverNow?: string }
  | { phase: 'VOTING'; round?: RoundView; serverNow?: string }
  | { phase: 'VOTED'; roundId?: string; serverNow?: string }
  | { phase: 'RESULTS'; result?: RoundResultDTO; serverNow?: string }
  | { phase: 'FINISHED'; serverNow?: string };

/**
 * Cria um agregado de eleição válido para os DTOs administrativos de teste.
 *
 * @param overrides - Campos específicos que importam para o cenário.
 * @returns Eleição completa com defaults determinísticos.
 */
function makeElection(overrides: Partial<Election> = {}): Election {
  return {
    id: 'election-1',
    adminId: 'admin-1',
    name: 'Mock Election',
    status: 'DRAFT',
    defaultVotingSeconds: 60,
    positions: [],
    queue: [],
    candidates: [],
    voters: [],
    rounds: [],
    version: 0,
    ...overrides,
  };
}

/**
 * Cria um resumo de eleição determinístico para handlers e testes de interface.
 *
 * @param overrides - Campos específicos que importam para o cenário.
 * @returns Resumo completo de eleição com defaults válidos.
 */
export function makeElectionSummaryDTO(
  overrides: Partial<ElectionSummaryDTO> = {},
): ElectionSummaryDTO {
  return {
    id: 'election-1',
    name: 'Mock Election',
    status: 'DRAFT',
    positionCount: 0,
    voterCount: 0,
    ...overrides,
  };
}

/**
 * Cria uma cédula de eleitor com um candidato e prazo conhecidos.
 *
 * @param overrides - Campos específicos que importam para o cenário.
 * @returns Cédula completa com defaults determinísticos.
 */
export function makeRoundView(overrides: Partial<RoundView> = {}): RoundView {
  return {
    roundId: 'round-1',
    positionTitle: 'President',
    kind: 'FIRST',
    candidates: [{ id: 'candidate-1', name: 'Ana' }],
    deadline: '2026-01-01T12:01:00.000Z',
    ...overrides,
  };
}

/**
 * Cria o resultado de uma rodada fechada com contagem válida.
 *
 * @param overrides - Campos específicos que importam para o cenário.
 * @returns Resultado completo com defaults determinísticos.
 */
export function makeRoundResultDTO(overrides: Partial<RoundResultDTO> = {}): RoundResultDTO {
  return {
    roundId: 'round-1',
    positionTitle: 'President',
    kind: 'FIRST',
    counts: [{ candidateId: 'candidate-1', name: 'Ana', votes: 1 }],
    blank: 0,
    validVotes: 1,
    outcome: 'ELECTED',
    electedCandidateId: 'candidate-1',
    tiebreakApplied: false,
    ...overrides,
  };
}

/**
 * Cria o estado administrativo completo com eleição e progresso previsíveis.
 *
 * @param overrides - Campos específicos que importam para o cenário.
 * @returns DTO administrativo válido.
 */
export function makeAdminElectionDTO(overrides: Partial<AdminElectionDTO> = {}): AdminElectionDTO {
  return {
    election: makeElection(),
    next: { status: 'NONE_LEFT' },
    canUndo: false,
    serverNow: SERVER_NOW,
    ...overrides,
  };
}

/**
 * Cria uma fase de eleitor válida com defaults previsíveis por discriminante.
 *
 * @param options - Fase e campos necessários ao cenário.
 * @returns DTO de eleitor correspondente à fase.
 */
export function makeVoterStateDTO(options: VoterStateOptions = {}): VoterStateDTO {
  const serverNow = options.serverNow ?? SERVER_NOW;

  switch (options.phase) {
    case undefined:
    case 'WAITING':
      return {
        phase: 'WAITING',
        electionName: options.electionName ?? 'Mock Election',
        serverNow,
      };
    case 'VOTING':
      return {
        phase: 'VOTING',
        round: options.round ?? makeRoundView(),
        serverNow,
      };
    case 'VOTED':
      return {
        phase: 'VOTED',
        roundId: options.roundId ?? 'round-1',
        serverNow,
      };
    case 'RESULTS':
      return {
        phase: 'RESULTS',
        result: options.result ?? makeRoundResultDTO(),
        serverNow,
      };
    case 'FINISHED':
      return { phase: 'FINISHED', serverNow };
  }
}

/**
 * Cria uma resposta de erro REST com código e mensagem configuráveis.
 *
 * @param options - Código e mensagem que o teste deve observar.
 * @returns DTO de erro completo.
 */
export function makeErrorDTO(
  options: {
    code?: ErrorCode;
    message?: string;
  } = {},
): ErrorDTO {
  return {
    error: {
      code: options.code ?? 'INTERNAL_ERROR',
      message: options.message ?? 'Unexpected error',
    },
  };
}
