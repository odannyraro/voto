import { defineConfig } from 'tsup';

// Build de produção do servidor (architecture.md §13): um único `dist/main.js` que o Render
// roda com `node`. Só o código do monorepo entra no pacote; as dependências de terceiros
// (Fastify, pg, Socket.IO...) continuam vindo do `node_modules` instalado pelo `npm ci`.
export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  // ESM porque o `main.ts` usa `await` no topo do módulo.
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: true,
  // Os workspaces `@voto/*` exportam o próprio `.ts` (sem build), e o Node não roda TypeScript
  // de dentro do `node_modules`: por isso são empacotados junto.
  noExternal: [/^@voto\//],
  // O `pg` importa `pg-native` só se existir; ele não está instalado e não pode entrar no pacote.
  external: ['pg-native'],
});
