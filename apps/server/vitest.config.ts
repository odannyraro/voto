import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.shared';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // main.ts é só composição (objeto humilde): fica fora da cobertura (architecture.md §10.1).
    coverage: coverageConfig(['src/main.ts']),
  },
});
