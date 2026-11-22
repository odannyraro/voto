// Tipos centrais do agregado (architecture.md §5.1).
// Provisório: quando a S0.3a criar `packages/shared/src/dto.ts`, este arquivo passa a só
// reexportar os tipos de `@voto/shared`, mantendo os mesmos nomes.

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
  /** Controle otimista de concorrência; quem incrementa é o repositório. */
  readonly version: number;
}
