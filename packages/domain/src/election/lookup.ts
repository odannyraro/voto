import type { Election, Position } from '../model';

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

