import { defineConfig } from 'vitest/config';

// Config só para o StrykerJS: ele roda numa cópia do pacote em `.stryker-tmp/`, onde o
// `vitest.shared.ts` da raiz não existe. Cobertura não importa na mutação.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
