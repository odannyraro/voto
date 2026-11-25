import type { ComponentType, PropsWithChildren, ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

/** Providers de aplicação opcionais que podem envolver o componente sob teste. */
type TestProvider = ComponentType<PropsWithChildren>;

/** Opções de renderização com router e providers independentes por teste. */
export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Rota inicial do router em memória. */
  readonly initialEntries?: string[];
  /** Provider de autenticação da aplicação, quando necessário ao cenário. */
  readonly authProvider?: TestProvider;
  /** Provider de socket da aplicação, quando necessário ao cenário. */
  readonly socketProvider?: TestProvider;
}

/**
 * Renderiza uma árvore React com router em memória e providers opcionais.
 *
 * @param ui - Componente ou árvore a renderizar.
 * @param options - Rota, providers e opções aceitas pelo Testing Library.
 * @returns Resultado público de renderização do Testing Library.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult {
  const {
    initialEntries = ['/'],
    authProvider: AuthProvider = PassThroughProvider,
    socketProvider: SocketProvider = PassThroughProvider,
    ...renderOptions
  } = options;

  /**
   * Mantém os providers específicos do teste dentro de uma instância de router isolada.
   *
   * @param props - Conteúdo renderizado pela árvore de teste.
   * @returns Árvore sob router, auth e socket.
   */
  function Wrapper({ children }: PropsWithChildren): ReactElement {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <SocketProvider>{children}</SocketProvider>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { ...renderOptions, wrapper: Wrapper });
}

/**
 * Deixa o conteúdo passar quando o cenário não precisa de um provider específico.
 *
 * @param props - Conteúdo renderizado pelo provider neutro.
 * @returns O conteúdo sem alterações.
 */
function PassThroughProvider({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}
