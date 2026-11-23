import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { registerAuth } from './http/auth-plugin';
import { registerAuthRoutes } from './http/auth-routes';
import { registerErrorHandling } from './http/error-handler';
import type {
  AdminRepository,
  Clock,
  CodeGenerator,
  ElectionRepository,
  Notifier,
  Scheduler,
} from './ports';
import { AuthService } from './services/auth';

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
}

/**
 * Monta o app Fastify sem abrir porta, para `main.ts` fazer `listen` e os testes usarem `inject`.
 * O domínio não entra nas deps: é puro e determinístico, então é importado direto.
 *
 * @param deps - Configuração e portas da aplicação.
 * @returns A instância Fastify com health check, tratamento de erros e rotas de login do admin.
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

  return app;
}
