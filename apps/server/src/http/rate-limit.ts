import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Clock } from '../ports';
import { httpErrorFor } from './errors';

/** Limite de tentativas de uma rota: no máximo `max` por cliente a cada `windowMs`. */
interface RateLimitRule {
  readonly method: string;
  /** Padrão da rota como foi registrada no Fastify (ex.: `/api/admin/login`). */
  readonly url: string;
  readonly max: number;
  readonly windowMs: number;
}

/** Contagem de um cliente na janela corrente. */
interface WindowCount {
  readonly startMs: number;
  readonly count: number;
}

const ONE_MINUTE_MS = 60_000;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Limites da §8.4, contra força bruta de senha e de códigos de eleitor. O login do admin é de
 * uma pessoa só; a entrada do eleitor é mais folgada porque a sala inteira pode sair pelo mesmo
 * IP (NAT da rede da universidade). Mesmo com 60 por minuto, adivinhar um código de 8 caracteres
 * levaria milhões de anos.
 */
const RATE_LIMITS: readonly RateLimitRule[] = [
  { method: 'POST', url: '/api/admin/login', max: 10, windowMs: ONE_MINUTE_MS },
  { method: 'POST', url: '/api/voter/session', max: 60, windowMs: ONE_MINUTE_MS },
];

/**
 * Conta as tentativas de um cliente numa janela fixa e diz se a próxima passa. É pura: recebe a
 * contagem anterior e o instante, e devolve a contagem nova, para o hook só guardar o resultado.
 *
 * @param previous - Contagem guardada do cliente, se houver.
 * @param rule - Limite da rota.
 * @param nowMs - Instante da tentativa, em ms.
 * @returns A contagem nova e, se a tentativa passou do limite, quantos segundos faltam para a
 *   janela acabar (arredondado para cima, como o cabeçalho `Retry-After` pede).
 */
function countAttempt(
  previous: WindowCount | undefined,
  rule: RateLimitRule,
  nowMs: number,
): { readonly next: WindowCount; readonly retryAfterSeconds?: number } {
  const expired = previous === undefined || nowMs - previous.startMs >= rule.windowMs;
  const next = expired ? { startMs: nowMs, count: 1 } : { ...previous, count: previous.count + 1 };
  if (next.count <= rule.max) return { next };
  const remainingMs = next.startMs + rule.windowMs - nowMs;
  return { next, retryAfterSeconds: Math.ceil(remainingMs / MILLISECONDS_PER_SECOND) };
}

/**
 * Limita as tentativas nas rotas públicas de entrada (login do admin e sessão do eleitor), por
 * rota e por IP. Quem passa do limite recebe 429 `RATE_LIMITED` no formato `ErrorDTO` e o
 * cabeçalho `Retry-After`. O tempo vem da porta `Clock`, então a janela é testável com o
 * `FakeClock`. Os contadores ficam em memória: com uma instância só do servidor, basta.
 *
 * @param app - Instância Fastify; deve vir depois de `registerErrorHandling`.
 * @param clock - Relógio da aplicação.
 */
export function registerRateLimit(app: FastifyInstance, clock: Clock): void {
  const counts = new Map<string, WindowCount>();

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const rule = RATE_LIMITS.find(
      (candidate) =>
        candidate.method === request.method && candidate.url === request.routeOptions.url,
    );
    if (!rule) return;

    const key = `${rule.method} ${rule.url} ${request.ip}`;
    const { next, retryAfterSeconds } = countAttempt(counts.get(key), rule, clock.now().getTime());
    counts.set(key, next);
    if (retryAfterSeconds === undefined) return;

    reply.header('retry-after', String(retryAfterSeconds));
    throw httpErrorFor('RATE_LIMITED', 'Too many attempts, try again later');
  });
}
