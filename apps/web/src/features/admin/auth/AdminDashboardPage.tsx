import type { ReactElement } from 'react';
import { Navigate } from 'react-router';
import { AdminElectionsPage } from '../elections/AdminElectionsPage';
import { useAdminAuth } from './admin-auth-context';

/**
 * Confirma a identidade validada e disponibiliza a ação de encerrar a sessão.
 *
 * @returns Conteúdo protegido mínimo para o fluxo de autenticação administrativa.
 */
export function AdminDashboardPage(): ReactElement {
  const { admin, logout, token } = useAdminAuth();

  if (admin === null || token === null) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <main>
      <h1>Administrator dashboard</h1>
      <p>Signed in as {admin.username}</p>
      <button type="button" onClick={logout}>
        Log out
      </button>
      <AdminElectionsPage token={token} />
    </main>
  );
}
