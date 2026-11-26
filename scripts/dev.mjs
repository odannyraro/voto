import { spawn } from 'node:child_process';

// `npm run dev` (architecture.md §14): servidor e front em modo de desenvolvimento, em paralelo.
// O servidor (apps/server) recompila e reinicia a cada arquivo salvo, na porta 3000; o Vite
// (apps/web) serve o front e repassa `/api` e `/socket.io` para ele. Feito em Node puro, sem
// dependência nova, para funcionar igual no Linux, no macOS e no Windows.

/** Workspaces que sobem juntos, cada um com o próprio script `dev`. */
const WORKSPACES = ['apps/server', 'apps/web'];

/** Processos ainda rodando, para encerrar todos quando um deles parar. */
const running = new Set();

/**
 * Sobe o script `dev` de um workspace, com a saída no mesmo terminal.
 *
 * @param workspace - Pasta do workspace (ex.: `apps/server`).
 * @returns O processo filho criado.
 */
function startDev(workspace) {
  // No Windows, o `npm` é um `.cmd` e só roda por um shell.
  const child = spawn('npm', ['run', 'dev', '-w', workspace], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  running.add(child);
  child.on('exit', (code) => {
    running.delete(child);
    stopAll(workspace, code);
  });
  return child;
}

/**
 * Encerra os outros processos quando um deles termina: sem o servidor, o front não tem para
 * onde mandar as chamadas, e sem o front não há o que desenvolver.
 *
 * @param workspace - Workspace cujo processo terminou.
 * @param code - Código de saída dele (`null` se foi encerrado por sinal).
 */
function stopAll(workspace, code) {
  if (running.size === 0) {
    process.exitCode = code ?? 0;
    return;
  }
  process.stderr.write(`\n[dev] ${workspace} terminou; encerrando os demais.\n`);
  for (const child of running) child.kill();
}

for (const workspace of WORKSPACES) startDev(workspace);
