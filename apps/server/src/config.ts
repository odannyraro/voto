import { z } from 'zod';

/** Configuração do servidor, já validada e tipada. */
export interface Config {
  readonly port: number;
  readonly nodeEnv: 'development' | 'test' | 'production';
  /** Segredo de assinatura dos JWTs; em dev e teste usa um valor fixo e inseguro. */
  readonly jwtSecret: string;
  /** Credenciais do admin inicial (seed). Só são obrigatórias em produção. */
  readonly adminUsername?: string;
  readonly adminPassword?: string;
  readonly repository: 'memory' | 'pg';
  /** Só presente quando o repositório é `pg`. */
  readonly databaseUrl?: string;
  readonly bcryptRounds: number;
  /** Tolerância (ms) para votos que chegam logo após o prazo da rodada. */
  readonly voteGraceMs: number;
  /** Quantos snapshots o desfazer guarda por eleição. */
  readonly historyLimit: number;
  /** Pasta do build do front, servida pelo próprio servidor quando informada. */
  readonly webDistDir?: string;
  /**
   * Liga o limite de tentativas no login e na entrada do eleitor (§8.4). Os e2e desligam
   * (`RATE_LIMIT=off`), porque todos os navegadores do teste saem do mesmo IP.
   */
  readonly rateLimit: boolean;
}

/** Variáveis de ambiente cruas (`process.env` em produção). */
type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_PORT = 3000;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const DEFAULT_BCRYPT_ROUNDS = 10;
// bcryptjs só aceita custo entre 4 e 31.
const MIN_BCRYPT_ROUNDS = 4;
const MAX_BCRYPT_ROUNDS = 31;
const DEFAULT_VOTE_GRACE_MS = 1000;
const DEFAULT_HISTORY_LIMIT = 50;
// Segredo conhecido de propósito: só vale fora de produção, onde a variável é obrigatória.
const DEV_JWT_SECRET = 'dev-only-jwt-secret-do-not-use-in-production';

/**
 * Schema de uma variável inteira dentro de um intervalo. Não usa `z.coerce`,
 * porque `Number('')` e `Number('80x')` dariam resultados enganosos.
 *
 * @param min - Menor valor aceito (inclusive).
 * @param max - Maior valor aceito (inclusive); sem ele, não há teto.
 * @returns Schema que lê texto e produz um número inteiro.
 */
function integerVar(min: number, max?: number) {
  const message =
    max === undefined
      ? `must be an integer greater than or equal to ${min}`
      : `must be an integer between ${min} and ${max}`;
  return z
    .string()
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, message)
        .max(max ?? Number.MAX_SAFE_INTEGER, message),
    );
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: integerVar(MIN_PORT, MAX_PORT).default(DEFAULT_PORT),
    JWT_SECRET: z.string().optional(),
    ADMIN_USERNAME: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
    REPOSITORY: z.enum(['memory', 'pg']).default('memory'),
    DATABASE_URL: z.string().optional(),
    BCRYPT_ROUNDS: integerVar(MIN_BCRYPT_ROUNDS, MAX_BCRYPT_ROUNDS).default(DEFAULT_BCRYPT_ROUNDS),
    VOTE_GRACE_MS: integerVar(0).default(DEFAULT_VOTE_GRACE_MS),
    HISTORY_LIMIT: integerVar(1).default(DEFAULT_HISTORY_LIMIT),
    WEB_DIST_DIR: z.string().optional(),
    RATE_LIMIT: z.enum(['on', 'off']).default('on'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const name of ['JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'] as const) {
        if (env[name] === undefined) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'is required in production' });
        }
      }
    }
    if (env.REPOSITORY === 'pg' && env.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'is required when REPOSITORY is pg',
      });
    }
  })
  .transform((env): Config => ({
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    adminUsername: env.ADMIN_USERNAME,
    adminPassword: env.ADMIN_PASSWORD,
    repository: env.REPOSITORY,
    databaseUrl: env.DATABASE_URL,
    bcryptRounds: env.BCRYPT_ROUNDS,
    voteGraceMs: env.VOTE_GRACE_MS,
    historyLimit: env.HISTORY_LIMIT,
    webDistDir: env.WEB_DIST_DIR,
    rateLimit: env.RATE_LIMIT === 'on',
  }));

/**
 * Descarta as variáveis vazias. Arquivos `.env` e painéis de deploy costumam
 * deixar `VAR=` em branco, e isso deve valer como "não definida".
 *
 * @param env - Variáveis de ambiente cruas.
 * @returns Cópia sem as chaves vazias ou indefinidas.
 */
function withoutEmptyValues(env: Env): Record<string, string> {
  const entries = Object.entries(env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  return Object.fromEntries(entries);
}

/**
 * Valida as variáveis de ambiente e devolve a configuração tipada. É a única
 * porta de entrada do ambiente: nenhum outro módulo lê `process.env`.
 *
 * @param env - Variáveis de ambiente (em produção, `process.env`). Texto vazio vale como ausente.
 * @returns A configuração com os padrões aplicados.
 * @throws {Error} Se alguma variável for inválida ou obrigatória e ausente. A mensagem lista
 *   todos os problemas, um por linha, no formato `NOME: motivo`.
 */
export function loadConfig(env: Env): Config {
  const parsed = envSchema.safeParse(withoutEmptyValues(env));
  if (parsed.success) {
    return parsed.data;
  }
  const problems = parsed.error.issues.map(
    (issue) => `- ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}
