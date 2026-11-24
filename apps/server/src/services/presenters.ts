import { canUndo, lastResultView, nextPositionStatus, voterView } from '@voto/domain';
import type { AdminElectionDTO, Election, Round, VoterStateDTO } from '@voto/shared';
import type { ElectionRecord } from '../ports';

/**
 * Monta o estado completo do painel do admin: a eleição, a rodada em andamento com o
 * progresso de votos (sem a contagem por candidato), o último resultado, o próximo passo
 * e se há o que desfazer. O cálculo fica no domínio; aqui só se juntam as peças.
 *
 * @param record - Registro da eleição (atual + histórico).
 * @param now - Instante do servidor, para o cliente sincronizar o relógio.
 * @returns O DTO do admin.
 */
export function toAdminElectionDTO(record: ElectionRecord, now: Date): AdminElectionDTO {
  const election = record.current;
  const openRound = election.rounds.find((round) => round.status === 'OPEN');
  const lastResult = lastResultView(election);
  return {
    election,
    // Campos opcionais só entram quando existem (evita `undefined` explícito no JSON).
    ...(openRound && { currentRound: toCurrentRound(election, openRound) }),
    ...(lastResult && { lastResult }),
    next: nextPositionStatus(election),
    canUndo: canUndo(record),
    serverNow: now.toISOString(),
  };
}

/**
 * Decide o que a tela de um eleitor mostra agora. Nunca expõe códigos de outros eleitores
 * nem contagens antes da liberação (regra garantida por `voterView`).
 *
 * @param election - Eleição atual.
 * @param voterId - Eleitor que receberá o estado.
 * @param now - Instante do servidor.
 * @returns O DTO do eleitor.
 */
export function toVoterStateDTO(election: Election, voterId: string, now: Date): VoterStateDTO {
  return { ...voterView(election, voterId), serverNow: now.toISOString() };
}

/**
 * Cédula e progresso da rodada aberta para o painel do admin.
 *
 * @param election - Eleição atual.
 * @param round - Rodada aberta.
 * @returns A cédula (nomes e prazo) com `votedCount` e `eligibleCount`; sem contagem por candidato.
 */
function toCurrentRound(
  election: Election,
  round: Round,
): NonNullable<AdminElectionDTO['currentRound']> {
  return {
    roundId: round.id,
    positionTitle:
      election.positions.find((p) => p.id === round.positionId)?.title ?? round.positionId,
    kind: round.kind,
    candidates: round.candidateIds.map((id) => ({
      id,
      name: election.candidates.find((candidate) => candidate.id === id)?.name ?? id,
    })),
    deadline: round.deadline,
    votedCount: round.votedVoterIds.length,
    eligibleCount: round.eligibleVoterIds.length,
  };
}
