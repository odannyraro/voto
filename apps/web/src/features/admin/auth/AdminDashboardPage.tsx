import type { ReactElement } from 'react';
import { useAdminAuth } from './admin-auth-context';

/**
 * Confirma a identidade validada e disponibiliza a ação de encerrar a sessão.
 *
 * @returns Conteúdo protegido mínimo para o fluxo de autenticação administrativa.
 */
export function AdminDashboardPage(): ReactElement {
  const { admin, logout } = useAdminAuth();

  return (
    <main>
      <h1>Administrator dashboard</h1>
      {admin !== null && <p>Signed in as {admin.username}</p>}
      <button type="button" onClick={logout}>
        Log out
      </button>
    </main>
  );
}
