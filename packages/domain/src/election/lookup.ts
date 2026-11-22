import type { Candidate, Election, Position, Round } from '../model';

// Leituras e substituições imutáveis sobre o agregado, compartilhadas pelos comandos.

/**
 * Procura um cargo pelo id.
 *
 * @param election - Eleição onde procurar.
 * @param positionId - Id do cargo.
 * @returns O cargo, ou `undefined` se não existir.
 */
export function findPosition(election: Election, positionId: string): Position | undefined {
  return election.positions.find((position) => position.id === positionId);
}

/**
 * Procura um candidato pelo id.
 *
 * @param election - Eleição onde procurar.
 * @param candidateId - Id do candidato.
 * @returns O candidato, ou `undefined` se não existir.
 */
export function findCandidate(election: Election, candidateId: string): Candidate | undefined {
  return election.candidates.find((candidate) => candidate.id === candidateId);
}

/**
 * Devolve uma cópia da eleição com um cargo trocado pela versão nova (mesmo id).
 *
 * @param election - Eleição atual.
 * @param updated - Nova versão do cargo.
 * @returns A eleição com o cargo substituído.
 */
export function replacePosition(election: Election, updated: Position): Election {
  return {
    ...election,
    positions: election.positions.map((position) => (position.id === updated.id ? updated : position)),
  };
}


/**
 * Devolve uma cópia da eleição com um candidato trocado pela versão nova (mesmo id).
 *
 * @param election - Eleição atual.
 * @param updated - Nova versão do candidato.
 * @returns A eleição com o candidato substituído.
 */
export function replaceCandidate(election: Election, updated: Candidate): Election {
  return {
    ...election,
    candidates: election.candidates.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
  };
}

/**
 * Diz se o candidato já foi eleito para algum cargo.
 *
 * @param election - Eleição atual.
 * @param candidateId - Id do candidato.
 * @returns `true` se algum cargo `DECIDED` tem esse candidato como eleito.
 */
export function isElected(election: Election, candidateId: string): boolean {
  return election.positions.some(
    (position) => position.status === 'DECIDED' && position.electedCandidateId === candidateId,
  );
}

/**
 * Devolve a rodada aberta da eleição, se houver (a regra garante no máximo uma).
 *
 * @param election - Eleição atual.
 * @returns A rodada `OPEN`, ou `undefined`.
 */
export function findOpenRound(election: Election): Round | undefined {
  return election.rounds.find((round) => round.status === 'OPEN');
}
