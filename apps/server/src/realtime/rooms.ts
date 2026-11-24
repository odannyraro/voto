/**
 * Sala dos admins que acompanham uma eleição (recebem `admin:state`).
 *
 * @param electionId - Eleição observada.
 * @returns O nome da sala.
 */
export function adminRoom(electionId: string): string {
  return `admin:${electionId}`;
}

/**
 * Sala de todos os eleitores de uma eleição (architecture.md §7).
 *
 * @param electionId - Eleição do eleitor.
 * @returns O nome da sala.
 */
export function electionVotersRoom(electionId: string): string {
  return `voters:${electionId}`;
}

/**
 * Sala individual de um eleitor (recebe o próprio `voter:state`).
 *
 * @param voterId - Eleitor destinatário.
 * @returns O nome da sala.
 */
export function voterRoom(voterId: string): string {
  return `voter:${voterId}`;
}
