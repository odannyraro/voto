import { eligibleCandidates } from '../eligibility/eligibility';
import type { Election } from '../model';

/** Pontuação de um cargo da fila para a sugestão de ordem. */
interface PositionScore {
  readonly positionId: string;
  /** Posição atual na fila; último critério, para a ordenação ser estável. */
  readonly queueIndex: number;
  /** Tem ao menos dois aptos (há disputa de fato). */
  readonly contested: boolean;
  readonly conflicts: number;
  readonly eligible: number;
  readonly firstChoices: number;
}

const MIN_CANDIDATES_FOR_CONTEST = 2;

/**
 * Sugere a ordem de votação dos cargos pendentes (architecture.md §5.4, "Algoritmo de
 * ordenação"). A ideia é resolver cedo os cargos que, ao eleger alguém, mais liberam ou
 * bloqueiam outros. Critérios, nesta ordem: cargos com disputa (2+ aptos) antes dos sem
 * disputa; mais conflitos (aptos que também concorrem a outros cargos pendentes); mais
 * aptos; mais candidatos com o cargo como primeira opção; ordem atual da fila.
 *
 * @param election - Eleição atual (não é alterada; a ordem só vale após `applyOrder`).
 * @returns Os ids dos cargos da fila, na ordem sugerida.
 */
export function suggestOrder(election: Election): string[] {
  return election.queue
    .map((positionId, queueIndex) => scorePosition(election, positionId, queueIndex))
    .sort(
      (a, b) =>
        Number(b.contested) - Number(a.contested) ||
        b.conflicts - a.conflicts ||
        b.eligible - a.eligible ||
        b.firstChoices - a.firstChoices ||
        a.queueIndex - b.queueIndex,
    )
    .map((score) => score.positionId);
}

/**
 * Calcula os critérios de um cargo da fila.
 *
 * @param election - Eleição atual.
 * @param positionId - Id do cargo.
 * @param queueIndex - Posição atual do cargo na fila.
 * @returns A pontuação do cargo.
 */
function scorePosition(election: Election, positionId: string, queueIndex: number): PositionScore {
  const eligible = eligibleCandidates(election, positionId);
  const runsElsewhere = (applications: readonly string[]): boolean =>
    applications.some((other) => other !== positionId && election.queue.includes(other));

  return {
    positionId,
    queueIndex,
    contested: eligible.length >= MIN_CANDIDATES_FOR_CONTEST,
    conflicts: eligible.filter((candidate) => runsElsewhere(candidate.applications)).length,
    eligible: eligible.length,
    firstChoices: eligible.filter((candidate) => candidate.firstChoicePositionId === positionId)
      .length,
  };
}
