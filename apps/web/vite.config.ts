import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.shared.ts';

/** Porta do servidor Fastify em desenvolvimento (architecture.md §14). */
const SERVER_ORIGIN = process.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
const VITE_PORT = Number(process.env.VITE_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_HOST ?? 'localhost',
    port: VITE_PORT,
    strictPort: true,
    // Em dev o front fala com o servidor pelo proxy, então não há CORS (igual à produção).
    proxy: {
      '/api': SERVER_ORIGIN,
      '/socket.io': { target: SERVER_ORIGIN, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    // main.tsx é só composição (objeto humilde): fica fora da cobertura (architecture.md §10.1).
    coverage: coverageConfig(['src/main.tsx']),
  },
});
