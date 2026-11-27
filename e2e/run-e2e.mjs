import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const E2E_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const PLAYWRIGHT_CLI = resolve(E2E_DIRECTORY, 'node_modules/@playwright/test/cli.js');

/**
 * Escolhe uma porta livre para iniciar cada execução E2E sem disputar as portas de desenvolvimento.
 *
 * @returns Porta TCP disponível no loopback.
 * @throws {Error} Se o sistema não conseguir reservar e liberar uma porta.
 */
async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to determine an available local port.');
  }

  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error !== undefined) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
  return address.port;
}

const apiPort = await getAvailablePort();
let webPort = await getAvailablePort();
while (webPort === apiPort) {
  webPort = await getAvailablePort();
}

const playwright = spawn(process.execPath, [PLAYWRIGHT_CLI, 'test', ...process.argv.slice(2)], {
  env: {
    ...process.env,
    E2E_API_PORT: String(apiPort),
    E2E_WEB_PORT: String(webPort),
  },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => playwright.kill(signal));
}

playwright.on('error', (error) => {
  process.stderr.write(`Unable to start Playwright: ${error.message}\n`);
  process.exitCode = 1;
});

playwright.on('exit', (code, signal) => {
  process.exitCode = signal === null ? (code ?? 1) : 1;
});
