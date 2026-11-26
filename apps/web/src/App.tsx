import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { VoterEntryPage } from './features/voter/VoterEntryPage';

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
    </Routes>
  );
}
