import type { ViteUserConfig } from 'vitest/config';

/** Cobertura mínima (%) exigida em cada workspace; nunca deve ser reduzida (CLAUDE.md). */
const MIN_COVERAGE_PERCENT = 80;

type CoverageConfig = NonNullable<NonNullable<ViteUserConfig['test']>['coverage']>;

/**
 * Monta a configuração de cobertura comum a todos os workspaces: provider v8,
 * relatórios `text` (terminal) e `lcov` (Codecov) em `<workspace>/coverage/`,
 * e limite mínimo de 80% em linhas, branches, funções e statements.
 *
 * @param exclude - Globs de arquivos "humildes" de composição fora da cobertura
 *   (architecture.md §10.1), ex.: `src/main.ts`. Vazio por padrão.
 * @returns Bloco `test.coverage` do Vitest, relativo ao workspace que o usa.
 */
export function coverageConfig(exclude: string[] = []): CoverageConfig {
  return {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    reportsDirectory: './coverage',
    include: ['src/**'],
    exclude,
    thresholds: {
      lines: MIN_COVERAGE_PERCENT,
      branches: MIN_COVERAGE_PERCENT,
      functions: MIN_COVERAGE_PERCENT,
      statements: MIN_COVERAGE_PERCENT,
    },
  };
}
