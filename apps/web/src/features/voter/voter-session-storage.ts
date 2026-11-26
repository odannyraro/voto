const VOTER_SESSION_STORAGE_KEY = 'voto:voter-session';

/** Credenciais mínimas necessárias para continuar uma sessão de eleitor. */
export interface VoterSessionCredentials {
  readonly token: string;
  readonly electionId: string;
}

/**
 * Recupera e valida as credenciais persistidas para continuar a sessão na aba atual.
 *
 * @returns Credenciais válidas ou `undefined` quando ausentes, corrompidas ou incompletas.
 */
export function getVoterSession(): VoterSessionCredentials | undefined {
  const storedSession = window.sessionStorage.getItem(VOTER_SESSION_STORAGE_KEY);
  if (storedSession === null) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(storedSession);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('token' in parsed) ||
      !('electionId' in parsed) ||
      typeof parsed.token !== 'string' ||
      typeof parsed.electionId !== 'string' ||
      parsed.token.length === 0 ||
      parsed.electionId.length === 0
    ) {
      return undefined;
    }

    return { token: parsed.token, electionId: parsed.electionId };
  } catch {
    return undefined;
  }
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
