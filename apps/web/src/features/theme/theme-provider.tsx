import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';

const THEME_STORAGE_KEY = 'vota-ae:theme';

/** Aparência visual disponível para a aplicação. */
export type Theme = 'light' | 'dark';

/** Preferência visual atual e ação para alternar entre os temas. */
export interface ThemeContextValue {
  readonly theme: Theme;
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Lê uma preferência de tema válida, usando o tema claro como opção inicial.
 *
 * @returns Tema salvo ou o tema claro quando não há preferência.
 */
function getInitialTheme(): Theme {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === 'dark' ? 'dark' : 'light';
}

/**
 * Mantém a preferência de aparência aplicada e persistida para a próxima visita.
 *
 * @param props - Conteúdo da aplicação que usa a preferência de tema.
 * @returns Árvore React sob o contexto de aparência.
 */
export function ThemeProvider({ children }: PropsWithChildren): ReactElement {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback((): void => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Retorna o tema e a ação de alternância disponíveis na aplicação.
 *
 * @returns Preferência atual e callback de alternância.
 * @throws {Error} Quando consumido fora de `ThemeProvider`.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }
  return context;
}
