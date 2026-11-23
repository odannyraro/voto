import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Monta a regra que proíbe imports de pacotes do monorepo que violam a direção das
 * dependências (architecture.md §3).
 *
 * @param forbidden - Nomes de pacotes `@voto/*` que o workspace não pode importar.
 * @returns Config flat do ESLint com `no-restricted-imports`.
 */
function forbidImports(forbidden) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map((name) => ({
          group: [name, `${name}/*`],
          message: `Direção de imports proibida (architecture.md §3): não importe ${name} aqui.`,
        })),
      },
    ],
  };
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  eslint.configs.recommended,
  // Sem regras que dependem de tipos: typescript-eslint ainda não suporta TS 7 (ver todo-backend.md).
  tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-console': 'error',
      // Prefixo `_` marca valor descartado de propósito (ex.: `const { x: _x, ...rest } = obj`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  // shared: base de tudo, não depende de nenhum outro pacote do monorepo.
  {
    files: ['packages/shared/**/*.{ts,tsx}'],
    rules: forbidImports(['@voto/domain', '@voto/server', '@voto/web']),
  },
  // domain: só pode usar @voto/shared.
  {
    files: ['packages/domain/**/*.{ts,tsx}'],
    rules: forbidImports(['@voto/server', '@voto/web']),
  },
  // server: usa domain e shared, nunca o web.
  {
    files: ['apps/server/**/*.{ts,tsx}'],
    rules: forbidImports(['@voto/web']),
  },
  // web: só conversa com o servidor pela rede, via contratos do shared.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: forbidImports(['@voto/domain', '@voto/server']),
  },
);
