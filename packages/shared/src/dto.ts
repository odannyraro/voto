import type { ErrorCode } from './error-codes';

// Formas compartilhadas entre servidor e frontend: o agregado da eleição (architecture.md
// §5.1) e os DTOs da API (§6.3). O comportamento do agregado fica em `@voto/domain`; aqui só
// há tipos (e a constante `BLANK`).

/** Regra usada para desempatar candidatos de um cargo. */
export type TiebreakRule = 'YOUNGEST' | 'OLDEST' | 'MOST_REMAINING_TIME';

/** Estado geral da eleição: configuração, votação em andamento ou encerrada. */
export type ElectionStatus = 'DRAFT' | 'OPEN' | 'FINISHED';

/** Estado de um cargo dentro do ciclo de votação. */
export type PositionStatus = 'PENDING' | 'VOTING' | 'AWAITING_RUNOFF' | 'DECIDED' | 'CANCELLED';

/** Situação do código de um eleitor. */
export type VoterStatus = 'CREDENTIALED' | 'REVOKED';

/** Tipo de rodada: primeiro turno ou segundo turno. */
export type RoundKind = 'FIRST' | 'RUNOFF';

/** Estado de uma rodada de votação. */
export type RoundStatus = 'OPEN' | 'CLOSED' | 'ANNULLED';

/** Chave da contagem usada para o voto em branco. */
export const BLANK = 'BLANK';

/** Escolha do eleitor: id de um candidato da cédula ou voto em branco. */
export type VoteChoice = string;

/** Cargo disputado na eleição. */
export interface Position {
  readonly id: string;
  readonly title: string;
  readonly tiebreak: TiebreakRule;
  readonly status: PositionStatus;
  /** Preenchido só quando o cargo está `DECIDED`. */
  readonly electedCandidateId?: string;
}

/** Pessoa que concorre a um ou mais cargos. */
export interface Candidate {
  readonly id: string;
  readonly name: string;
  /** Anos completos. */
  readonly age: number;
  /** Tempo restante na universidade, em meses. */
  readonly remainingMonths: number;
  /** Ids dos cargos a que concorre. */
  readonly applications: readonly string[];
  /** Precisa estar em `applications`. */
  readonly firstChoicePositionId: string;
  /** Instante ISO de cadastro; último critério de desempate. */
  readonly createdAt: string;
}

/** Eleitor credenciado por um código único. */
export interface Voter {
  readonly id: string;
  /** Rótulo opcional dado pelo admin, ex.: "Mesa 3". */
  readonly label?: string;
  readonly code: string;
  readonly status: VoterStatus;
}

/** Rodada de votação de um cargo, com cédula e eleitores congelados na abertura. */
export interface Round {
  readonly id: string;
  readonly positionId: string;
  readonly kind: RoundKind;
  readonly candidateIds: readonly string[];
  readonly eligibleVoterIds: readonly string[];
  /** Quem já votou; fica separado da contagem para garantir o sigilo do voto. */
  readonly votedVoterIds: readonly string[];
  /** Votos por candidato; a chave `BLANK` guarda os brancos. */
  readonly tally: Readonly<Record<string, number>>;
  readonly openedAt: string;
  /** Instante absoluto (ISO) a partir do qual a rodada não aceita votos. */
  readonly deadline: string;
  readonly status: RoundStatus;
  readonly resultsReleased: boolean;
}

/** Agregado da eleição: tudo que o domínio precisa para aplicar as regras. */
export interface Election {
  readonly id: string;
  readonly adminId: string;
  readonly name: string;
  readonly status: ElectionStatus;
  /** Prazo padrão de cada rodada, em segundos. */
  readonly defaultVotingSeconds: number;
  readonly positions: readonly Position[];
  /** Ids dos cargos `PENDING`, na ordem de votação. */
  readonly queue: readonly string[];
  readonly candidates: readonly Candidate[];
  readonly voters: readonly Voter[];
  readonly rounds: readonly Round[];
  /** Controle otimista de concorrência; quem incrementa é o servidor ao salvar. */
  readonly version: number;
}

/** Desfecho da apuração de uma rodada. */
export type RoundOutcome = 'ELECTED' | 'RUNOFF_REQUIRED' | 'NO_VALID_VOTES';

/** Cédula como o eleitor a vê: só nomes e prazo, nunca a contagem parcial. */
export interface RoundView {
  readonly roundId: string;
  readonly positionTitle: string;
  readonly kind: RoundKind;
  readonly candidates: readonly { readonly id: string; readonly name: string }[];
  /** Instante ISO em que a rodada deixa de aceitar votos. */
  readonly deadline: string;
}

/** Resultado de uma rodada fechada, com nomes no lugar de ids. */
export interface RoundResultDTO {
  readonly roundId: string;
  readonly positionTitle: string;
  readonly kind: RoundKind;
  /** Do mais para o menos votado. */
  readonly counts: readonly {
    readonly candidateId: string;
    readonly name: string;
    readonly votes: number;
  }[];
  readonly blank: number;
  /** Votos em candidatos; brancos não entram. */
  readonly validVotes: number;
  readonly outcome: RoundOutcome;
  /** Presente quando `outcome` é `ELECTED`. */
  readonly electedCandidateId?: string;
  /** Presente quando `outcome` é `RUNOFF_REQUIRED`. */
  readonly runoffCandidateIds?: readonly [string, string];
  /** Se a regra de desempate do cargo precisou ser usada. */
  readonly tiebreakApplied: boolean;
}

/** O que o admin deve fazer em seguida na votação. */
export interface NextPositionDTO {
  readonly status:
    'READY' | 'INSUFFICIENT_CANDIDATES' | 'NONE_LEFT' | 'ROUND_IN_PROGRESS' | 'AWAITING_RUNOFF';
  /** Cargo a que o status se refere; ausente em `NONE_LEFT`. */
  readonly positionId?: string;
  /** Só em `INSUFFICIENT_CANDIDATES`: candidatos existentes que podem ser anexados ao cargo. */
  readonly attachableCandidates?: readonly { readonly id: string; readonly name: string }[];
}

/** Estado completo da eleição para o painel do admin; quase toda rota de admin o devolve. */
export interface AdminElectionDTO {
  readonly election: Election;
  /** Rodada aberta, com o progresso de votos (sem a contagem por candidato). */
  readonly currentRound?: RoundView & {
    readonly votedCount: number;
    readonly eligibleCount: number;
  };
  /** Resultado da última rodada fechada, mesmo antes de liberado aos eleitores. */
  readonly lastResult?: RoundResultDTO;
  readonly next: NextPositionDTO;
  readonly canUndo: boolean;
  /** Hora do servidor (ISO), para o cliente sincronizar o relógio. */
  readonly serverNow: string;
}

/** O que a tela do eleitor deve mostrar agora. */
export type VoterStateDTO =
  | { readonly phase: 'WAITING'; readonly electionName: string; readonly serverNow: string }
  | { readonly phase: 'VOTING'; readonly round: RoundView; readonly serverNow: string }
  | { readonly phase: 'VOTED'; readonly roundId: string; readonly serverNow: string }
  | { readonly phase: 'RESULTS'; readonly result: RoundResultDTO; readonly serverNow: string }
  | { readonly phase: 'FINISHED'; readonly serverNow: string };

/** Linha da lista de eleições do admin. */
export interface ElectionSummaryDTO {
  readonly id: string;
  readonly name: string;
  readonly status: ElectionStatus;
  readonly positionCount: number;
  readonly voterCount: number;
}

/** Corpo de toda resposta de erro da API. */
export interface ErrorDTO {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
  };
}
