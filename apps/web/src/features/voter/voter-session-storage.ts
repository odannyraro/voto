const VOTER_SESSION_STORAGE_KEY = 'voto:voter-session';

/** Credenciais mínimas necessárias para continuar uma sessão de eleitor. */
export interface VoterSessionCredentials {
  readonly token: string;
  readonly electionId: string;
}

/**
 * Persiste somente o token e a eleição associados à sessão atual da aba.
 *
 * @param session - Token de eleitor emitido pela API e identificador da eleição.
 * @returns Grava as credenciais em `sessionStorage`.
 */
export function saveVoterSession(session: VoterSessionCredentials): void {
  window.sessionStorage.setItem(VOTER_SESSION_STORAGE_KEY, JSON.stringify(session));
}
