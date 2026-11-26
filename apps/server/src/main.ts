import { createServer } from './compose';
import { loadConfig } from './config';

// Objeto humilde (fora da cobertura, architecture.md §10.1): só lê o ambiente, monta e escuta.
// A montagem e o desligamento (timers, tempo real e pool do banco) são testados em `compose.ts`.

const config = loadConfig(process.env);
const app = await createServer(config);
// `0.0.0.0` para aceitar conexões de fora do contêiner (Render).
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    // O `close` espera as requisições em andamento, fecha o Socket.IO, cancela os timers e
    // encerra o pool; só então o processo sai.
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, 'Failed to shut down cleanly');
        process.exit(1);
      },
    );
  });
}
