import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { SocketProvider } from './api/socket-provider';
import { VoterEntryPage } from './features/voter/VoterEntryPage';
import { VoterSessionPage } from './features/voter/VoterSessionPage';
import { getVoterSession } from './features/voter/voter-session-storage';

/**
 * Raiz da aplicação: declara a tabela de rotas (architecture.md §9). O roteador
 * (`BrowserRouter` ou `MemoryRouter`) é fornecido por quem monta o componente,
 * para que os testes escolham a rota inicial.
 *
 * @returns As rotas da aplicação.
 */
export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<VoterEntryPage />} />
      <Route path="/votar" element={<VoterSessionRoute />} />
    </Routes>
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
