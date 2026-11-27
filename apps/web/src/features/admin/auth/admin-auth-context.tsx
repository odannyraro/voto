import type { LoginBody } from '@voto/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';
import { ApiError } from '../../../api/api-client';
import { adminApi } from '../../../api/admin-api';
import { getApiErrorMessage } from '../../../lib/ui-messages';

const ADMIN_TOKEN_STORAGE_KEY = 'voto:admin-token';

/** Identidade administrativa validada pela API. */
export interface AdminIdentity {
  readonly id: string;
  readonly username: string;
}

/** Estado de autenticação compartilhado pelas rotas administrativas. */
export interface AdminAuthContextValue {
  readonly status: 'loading' | 'anonymous' | 'authenticated';
  readonly token: string | null;
  readonly admin: AdminIdentity | null;
  readonly errorMessage: string | null;
  /** Autentica o administrador e valida sua identidade antes de persistir o token. */
  readonly login: (body: LoginBody) => Promise<void>;
  /** Encerra a sessão administrativa atual. */
  readonly logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/**
 * Cria uma mensagem legível quando a identidade salva não pode ser verificada.
 *
 * @param error - Falha recebida ao consultar `/admin/me`.
 * @returns Mensagem para orientar o administrador sem ocultar falha de rede.
 */
function getRestoreErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.error !== undefined) {
    return `Não foi possível recuperar sua sessão: ${getApiErrorMessage(error.error.code)}`;
  }

  return 'Não foi possível verificar sua sessão. Confira a conexão e entre novamente.';
}

/**
 * Mantém a identidade e o token do admin sincronizados com a API e a aba atual.
 *
 * @param props - Conteúdo da aplicação que consome a autenticação administrativa.
 * @returns Árvore sob o contexto de autenticação.
 */
export function AdminAuthProvider({ children }: PropsWithChildren): ReactElement {
  const [auth, setAuth] = useState<{
    readonly status: AdminAuthContextValue['status'];
    readonly token: string | null;
    readonly admin: AdminIdentity | null;
    readonly errorMessage: string | null;
  }>({ status: 'loading', token: null, admin: null, errorMessage: null });

  useEffect(() => {
    let active = true;
    const storedToken = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

    if (storedToken === null) {
      setAuth({ status: 'anonymous', token: null, admin: null, errorMessage: null });
      return () => {
        active = false;
      };
    }

    async function restoreSession(token: string): Promise<void> {
      try {
        const admin = await adminApi.getMe(token);
        if (active) {
          setAuth({ status: 'authenticated', token, admin, errorMessage: null });
        }
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        }
        setAuth({
          status: 'anonymous',
          token: null,
          admin: null,
          errorMessage: getRestoreErrorMessage(error),
        });
      }
    }

    void restoreSession(storedToken);
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (body: LoginBody): Promise<void> => {
    const { token } = await adminApi.login(body);
    const admin = await adminApi.getMe(token);
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    setAuth({ status: 'authenticated', token, admin, errorMessage: null });
  }, []);

  const logout = useCallback((): void => {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setAuth({ status: 'anonymous', token: null, admin: null, errorMessage: null });
  }, []);

  const value = useMemo(() => ({ ...auth, login, logout }), [auth, login, logout]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

/**
 * Retorna as credenciais e ações do provider administrativo mais próximo.
 *
 * @returns Estado e operações da sessão administrativa.
 * @throws {Error} Quando usado fora de `AdminAuthProvider`.
 */
export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (context === null) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider.');
  }

  return context;
}
