import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { registerAuth } from './http/auth-plugin';
import { registerAuthRoutes } from './http/auth-routes';
import { registerCandidateRoutes } from './http/candidate-routes';
import { registerElectionRoutes } from './http/election-routes';
import { registerErrorHandling } from './http/error-handler';
import { registerPositionRoutes } from './http/position-routes';
import { registerResolutionRoutes } from './http/resolution-routes';
import { registerRoundRoutes } from './http/round-routes';
import { registerVoterAccessRoutes } from './http/voter-access-routes';
import { registerVoterRoutes } from './http/voter-routes';
import type {
  AdminRepository,
  Clock,
  CodeGenerator,
  ElectionRepository,
  Notifier,
  Scheduler,
} from './ports';
import { attachRealtime, type RealtimeDeps, type RealtimeServer } from './realtime/gateway';
import { AuthService } from './services/auth';
import { ElectionService } from './services/election-service';
import { VoterService } from './services/voter-service';

/** Tudo o que o app precisa de fora: configuração e portas (architecture.md §8.1). */
export interface AppDeps {
  readonly config: Config;
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly notifier: Notifier;
  readonly codeGenerator: CodeGenerator;
  /** Gera ids novos de entidades (`crypto.randomUUID` em produção). */
  readonly newId: () => string;
  readonly electionRepository: ElectionRepository;
  readonly adminRepository: AdminRepository;
  /**
   * Servidor de tempo real (opcional). Quando vem, é ligado ao servidor HTTP do app e fechado
   * junto com ele; os testes que só usam `inject` não precisam dele.
   */
  readonly realtime?: RealtimeServer;
}

/**
 * Monta o app Fastify sem abrir porta, para `main.ts` fazer `listen` e os testes usarem `inject`.
 * O domínio não entra nas deps: é puro e determinístico, então é importado direto.
 *
 * @param deps - Configuração e portas da aplicação.
 * @returns A instância Fastify com health check, tratamento de erros, login do admin e as
 *   rotas de eleição, cargos, fila, candidatos, eleitores, rodadas e o desfecho delas (2º turno,
 *   liberação, desfazer...) e a entrada do eleitor (sessão por código e estado); com
 *   `deps.realtime`, também o gateway Socket.IO no mesmo servidor HTTP.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  // Silencia o log nos testes; em dev e produção o Fastify loga requisições e erros.
  const app = Fastify({ logger: deps.config.nodeEnv !== 'test' });
  registerErrorHandling(app);

  const auth = new AuthService({
    adminRepository: deps.adminRepository,
    clock: deps.clock,
    jwtSecret: deps.config.jwtSecret,
    bcryptRounds: deps.config.bcryptRounds,
    newId: deps.newId,
  });
  const hooks = registerAuth(app, auth);

  app.get('/api/health', () => ({ status: 'ok' }));
  registerAuthRoutes(app, { auth, adminRepository: deps.adminRepository, hooks });

  const elections = new ElectionService({
    electionRepository: deps.electionRepository,
    clock: deps.clock,
    scheduler: deps.scheduler,
    notifier: deps.notifier,
    logger: app.log,
    codeGenerator: deps.codeGenerator,
    newId: deps.newId,
    voteGraceMs: deps.config.voteGraceMs,
    historyLimit: deps.config.historyLimit,
  });
  const adminRouteDeps = { service: elections, clock: deps.clock, hooks };
  registerElectionRoutes(app, adminRouteDeps);
  registerPositionRoutes(app, adminRouteDeps);
  registerCandidateRoutes(app, adminRouteDeps);
  registerVoterRoutes(app, adminRouteDeps);
  registerRoundRoutes(app, adminRouteDeps);
  registerResolutionRoutes(app, adminRouteDeps);

  const voters = new VoterService({
    electionRepository: deps.electionRepository,
    elections,
    auth,
    clock: deps.clock,
  });
  registerVoterAccessRoutes(app, { service: voters, hooks });

  if (deps.realtime)
    attachRealtimeToApp(app, deps.realtime, { auth, elections, clock: deps.clock });

  return app;
}

/**
 * Liga o gateway de tempo real ao servidor HTTP do Fastify e o fecha antes do app, para os
 * sockets abertos não segurarem o encerramento.
 *
 * @param app - App cujo servidor HTTP recebe o Socket.IO.
 * @param io - Servidor de tempo real vindo das deps.
 * @param deps - Serviços que o gateway usa (tokens, dono da eleição e relógio).
 */
function attachRealtimeToApp(app: FastifyInstance, io: RealtimeServer, deps: RealtimeDeps): void {
  attachRealtime(io, app.server, deps);
  app.addHook('preClose', async () => {
    await io.close();
  });
}
