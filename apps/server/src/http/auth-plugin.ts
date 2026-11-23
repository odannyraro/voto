import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { AuthService, TokenClaims } from '../services/auth';
import { httpErrorFor } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    /** Claims do token, preenchidas por `requireAdmin` / `requireVoter`. */
    auth: TokenClaims | undefined;
  }
}

/** Os *preHandlers* de autorização por papel. */
export interface AuthHooks {
  readonly requireAdmin: preHandlerAsyncHookHandler;
  readonly requireVoter: preHandlerAsyncHookHandler;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Extrai o JWT do cabeçalho `Authorization: Bearer <jwt>`.
 *
 * @param request - Requisição recebida.
 * @returns O token, sem o prefixo.
 * @throws {HttpError} 401 `INVALID_TOKEN` se o cabeçalho faltar, não for Bearer ou vier sem token.
 */
function bearerTokenOf(request: FastifyRequest): string {
  const header = request.headers.authorization;
  const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : '';
  if (token === '') throw httpErrorFor('INVALID_TOKEN', 'Missing bearer token');
  return token;
}

/**
 * Registra o campo `request.auth` e cria os *preHandlers* que exigem um papel.
 * Token ausente ou inválido dá 401; token válido de outro papel dá 403.
 *
 * @param app - Instância Fastify que receberá o campo `auth` nas requisições.
 * @param auth - Serviço que verifica os tokens.
 * @returns `requireAdmin` e `requireVoter`, para usar em `{ preHandler }` das rotas.
 */
export function registerAuth(app: FastifyInstance, auth: AuthService): AuthHooks {
  app.decorateRequest('auth', undefined);

  const requireRole =
    (role: TokenClaims['role']): preHandlerAsyncHookHandler =>
    async (request) => {
      const claims = await auth.verifyToken(bearerTokenOf(request));
      if (claims.role !== role) {
        throw httpErrorFor('FORBIDDEN', `This route requires the ${role} role`);
      }
      request.auth = claims;
    };

  return { requireAdmin: requireRole('admin'), requireVoter: requireRole('voter') };
}

/**
 * Lê o id do admin autenticado numa rota protegida por `requireAdmin`.
 *
 * @param request - Requisição já passada pelo `requireAdmin`.
 * @returns O id do admin dono do token.
 * @throws {Error} Se a rota esqueceu o `requireAdmin` (bug de quem registrou a rota, vira 500).
 */
export function getAdminId(request: FastifyRequest): string {
  if (request.auth?.role !== 'admin') {
    throw new Error('Route must be protected by requireAdmin');
  }
  return request.auth.adminId;
}
