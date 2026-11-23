// Tipos centrais do agregado (architecture.md §5.1). As definições moraram aqui até a S0.3a;
// agora vivem em `@voto/shared` (`dto.ts`) para o servidor e o frontend usarem as mesmas
// formas. Este arquivo só reexporta, mantendo os nomes que o código do domínio já importa.
export { BLANK } from '@voto/shared';
export type {
  Candidate,
  Election,
  ElectionStatus,
  Position,
  PositionStatus,
  Round,
  RoundKind,
  RoundStatus,
  TiebreakRule,
  VoteChoice,
  Voter,
  VoterStatus,
} from '@voto/shared';
