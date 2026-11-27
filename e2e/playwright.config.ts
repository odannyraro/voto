import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const REPOSITORY_ROOT = resolve(E2E_DIRECTORY, '..');
const IS_CI = process.env.CI !== undefined;
const API_PORT = Number(process.env.E2E_API_PORT ?? 3000);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
const SERVER_URL = `${BASE_URL}/api/health`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;

/**
 * Configura Chromium e inicia o backend real em memória com o frontend pelo proxy do Vite.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: 1,
  reporter: IS_CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
      },
    },
  ],
  webServer: {
    command: `cross-env NODE_ENV=test REPOSITORY=memory RATE_LIMIT=off BCRYPT_ROUNDS=4 PORT=${API_PORT} VITE_PORT=${WEB_PORT} VITE_HOST=127.0.0.1 VITE_API_ORIGIN=${API_ORIGIN} ADMIN_USERNAME=e2e-admin ADMIN_PASSWORD=e2e-password JWT_SECRET=e2e-only-jwt-secret npm run dev`,
    cwd: REPOSITORY_ROOT,
    url: SERVER_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
