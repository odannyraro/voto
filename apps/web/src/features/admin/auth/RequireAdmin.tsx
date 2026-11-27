import type { ReactElement } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useAdminAuth } from './admin-auth-context';

/**
 * Restringe as rotas administrativas a uma identidade verificada por `/admin/me`.
 *
 * @returns Conteúdo protegido, indicador de verificação ou redirecionamento ao login.
 */
export function RequireAdmin(): ReactElement {
  const { status } = useAdminAuth();

  if (status === 'loading') {
    return <p role="status">Verificando sua sessão administrativa...</p>;
  }

  if (status === 'anonymous') {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
