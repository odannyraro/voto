import { loginBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import type { AdminRepository } from '../ports';
import type { AuthService } from '../services/auth';
import { getAdminId, type AuthHooks } from './auth-plugin';
import { httpErrorFor } from './errors';
import { parse } from './validate';

/** O que as rotas de autenticação do admin precisam. */
interface AuthRoutesDeps {
  readonly auth: AuthService;
  readonly adminRepository: AdminRepository;
  readonly hooks: AuthHooks;
}

/**
 * Registra `POST /api/admin/login` (usuário e senha → token) e `GET /api/admin/me`
 * (quem sou eu, para o front reabrir a sessão a partir do token guardado).
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de auth, repositório de admins e os *preHandlers* de papel.
 */
export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.post('/api/admin/login', async (request) => {
    const { username, password } = parse(loginBodySchema, request.body);
    return { token: await deps.auth.login(username, password) };
  });

  app.get('/api/admin/me', { preHandler: deps.hooks.requireAdmin }, async (request) => {
    const admin = await deps.adminRepository.findById(getAdminId(request));
    // Token ainda válido, mas o admin foi removido: a sessão deixa de valer.
    if (!admin) throw httpErrorFor('INVALID_TOKEN', 'Admin no longer exists');
    return { id: admin.id, username: admin.username };
  });
}
