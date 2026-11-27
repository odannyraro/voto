import type { ReactElement } from 'react';
import { Link, useLocation } from 'react-router';
import { useTheme } from '../features/theme/theme-provider';

/**
 * Apresenta a identidade Vota Ae, o acesso rápido do admin e a troca de aparência.
 *
 * @returns Cabeçalho acessível e persistente entre as telas da aplicação.
 */
export function AppHeader(): ReactElement {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isHomePage = pathname === '/';
  const nextThemeLabel = theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro';

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="app-brand" to="/" aria-label="Vota Ae">
          <svg
            className="app-brand__mark"
            viewBox="0 0 40 40"
            role="img"
            aria-label="Marca Vota Ae: caixa marcada"
          >
            <rect x="3" y="3" width="34" height="34" rx="8" />
            <path d="m11 20 6 6 13-14" />
          </svg>
          <span>Vota Ae</span>
        </Link>
        <nav className="app-header__actions" aria-label="Opções da interface">
          {isHomePage && (
            <Link className="admin-shortcut" to="/admin/login">
              Acesso administrativo
            </Link>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={nextThemeLabel}
            aria-pressed={theme === 'dark'}
            onClick={toggleTheme}
          >
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
            <span>{theme === 'light' ? 'Escuro' : 'Claro'}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
