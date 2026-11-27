import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { AppHeader } from './components/AppHeader';
import { SocketProvider } from './api/socket-provider';
import type { SocketClient } from './api/socket-client';
import { AdminDashboardPage } from './features/admin/auth/AdminDashboardPage';
import { AdminLoginPage } from './features/admin/auth/AdminLoginPage';
import { AdminAuthProvider, useAdminAuth } from './features/admin/auth/admin-auth-context';
import { RequireAdmin } from './features/admin/auth/RequireAdmin';
import { AdminElectionConfigurationPage } from './features/admin/elections/AdminElectionConfigurationPage';
import { VoterEntryPage } from './features/voter/VoterEntryPage';
import { VoterSessionPage } from './features/voter/VoterSessionPage';
import { getVoterSession } from './features/voter/voter-session-storage';
import { ThemeProvider } from './features/theme/theme-provider';

/** Dependências opcionais de composição da aplicação. */
export interface AppProps {
  /** Fábrica substituível do socket para testes determinísticos. */
  readonly createSocketClient?: (token: string) => SocketClient;
}

/**
 * Raiz da aplicação: declara a tabela de rotas (architecture.md §9). O roteador
 * (`BrowserRouter` ou `MemoryRouter`) é fornecido por quem monta o componente,
 * para que os testes escolham a rota inicial.
 *
 * @returns As rotas da aplicação.
 */
export function App({ createSocketClient }: AppProps = {}): ReactElement {
  return (
    <ThemeProvider>
      <AdminAuthProvider>
        <AppHeader />
        <Routes>
          <Route path="/" element={<VoterEntryPage />} />
          <Route path="/votar" element={<VoterSessionRoute />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<RequireAdmin />}>
            <Route index element={<AdminDashboardPage />} />
            <Route
              path="eleicoes/:electionId/configurar"
              element={<AdminElectionRoute createSocketClient={createSocketClient} />}
            />
            <Route path="*" element={<AdminDashboardPage />} />
          </Route>
        </Routes>
      </AdminAuthProvider>
    </ThemeProvider>
  );
}

/**
 * Abre o socket administrativo apenas para a sessão autenticada da eleição.
 *
 * @param props - Fábrica opcional do cliente realtime.
 * @returns Tela de configuração sob socket autenticado ou redirecionamento ao login.
 */
function AdminElectionRoute({ createSocketClient }: AppProps): ReactElement {
  const { token } = useAdminAuth();

  if (token === null) {
    return <AdminLoginPage />;
  }

  return (
    <SocketProvider token={token} createClient={createSocketClient}>
      <AdminElectionConfigurationPage />
    </SocketProvider>
  );
}

/**
 * Monta o realtime da sessão apenas quando existem credenciais persistidas.
 *
 * @returns Página do eleitor sob o provider autenticado ou estado sem sessão.
 */
function VoterSessionRoute(): ReactElement {
  const session = getVoterSession();

  return (
    <SocketProvider token={session?.token ?? null}>
      <VoterSessionPage token={session?.token ?? null} />
    </SocketProvider>
  );
}
