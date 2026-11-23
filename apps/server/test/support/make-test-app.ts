import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../../src/app';
import { InMemoryAdminRepository } from '../../src/adapters/in-memory-admin-repository';
import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import { loadConfig } from '../../src/config';
import { AuthService } from '../../src/services/auth';
import { FakeClock } from '../doubles/fake-clock';
import { FakeScheduler } from '../doubles/fake-scheduler';
import { SpyNotifier } from '../doubles/spy-notifier';
import { StubCodeGenerator } from '../doubles/stub-code-generator';

const TEST_START = new Date('2026-01-01T12:00:00.000Z');
// Custo mínimo do bcrypt: os testes de senha ficam rápidos.
const TEST_BCRYPT_ROUNDS = '4';

/** App de teste junto com os doubles, para o teste inspecionar o que aconteceu. */
export interface TestApp {
  readonly app: FastifyInstance;
  readonly deps: AppDeps;
  /** Serviço de auth com os mesmos repositório, relógio e segredo do app: semeia admins e emite tokens. */
  readonly auth: AuthService;
  readonly clock: FakeClock;
  readonly scheduler: FakeScheduler;
  readonly notifier: SpyNotifier;
}

/**
 * Monta o app com fakes e repositórios em memória; o teste sobrescreve só o que importa.
 *
 * @param overrides - Dependências a trocar (ex.: um repositório que falha).
 * @returns O app (ainda não "ready": registre rotas de teste antes do primeiro `inject`).
 */
export function makeTestApp(overrides: Partial<AppDeps> = {}): TestApp {
  const clock = new FakeClock(TEST_START);
  const scheduler = new FakeScheduler();
  const notifier = new SpyNotifier();
  let nextId = 0;
  const deps: AppDeps = {
    config: loadConfig({ NODE_ENV: 'test', BCRYPT_ROUNDS: TEST_BCRYPT_ROUNDS }),
    clock,
    scheduler,
    notifier,
    codeGenerator: new StubCodeGenerator([]),
    newId: () => `id-${++nextId}`,
    electionRepository: new InMemoryElectionRepository(),
    adminRepository: new InMemoryAdminRepository(),
    ...overrides,
  };
  const auth = new AuthService({
    adminRepository: deps.adminRepository,
    clock: deps.clock,
    jwtSecret: deps.config.jwtSecret,
    bcryptRounds: deps.config.bcryptRounds,
    newId: deps.newId,
  });
  return { app: buildApp(deps), deps, auth, clock, scheduler, notifier };
}
