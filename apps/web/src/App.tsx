import { APP_NAME } from '@voto/shared';
import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';

/**
 * Página inicial provisória: mostra o nome do sistema vindo de `@voto/shared`, o que
 * prova que o import entre workspaces funciona. O formulário de código do eleitor
 * entra aqui nas tarefas do frontend.
 *
 * @returns O elemento com o título da página.
 */
function HomePage(): ReactElement {
  return <h1>{APP_NAME}</h1>;
}

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
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
