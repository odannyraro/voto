import { openRoundBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { toAdminElectionDTO } from '../services/presenters';
import type { AdminRouteDeps, ElectionParams, RoundParams } from './admin-route-deps';
import { getAdminId } from './auth-plugin';
import { parse } from './validate';

/**
 * Registra as rotas do começo do ciclo de votação (architecture.md §6.1): abrir a eleição,
 * consultar o próximo passo, abrir uma rodada e fechá-la na mão. As rotas só traduzem HTTP e
 * delegam ao `ElectionService`.
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de eleições, relógio e os *preHandlers* de papel.
 */
export function registerRoundRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { service, clock } = deps;
  const adminOnly = { preHandler: deps.hooks.requireAdmin };

  app.post<{ Params: ElectionParams }>('/api/elections/:id/open', adminOnly, async (request) => {
    const record = await service.openElection(getAdminId(request), request.params.id);
    return toAdminElectionDTO(record, clock.now());
  });

  app.get<{ Params: ElectionParams }>('/api/elections/:id/next', adminOnly, async (request) =>
    service.nextPosition(getAdminId(request), request.params.id),
  );

  app.post<{ Params: ElectionParams }>(
    '/api/elections/:id/rounds',
    adminOnly,
    async (request, reply) => {
      const body = parse(openRoundBodySchema, request.body);
      const record = await service.openRound(getAdminId(request), request.params.id, body);
      return reply.code(201).send(toAdminElectionDTO(record, clock.now()));
    },
  );

  app.post<{ Params: RoundParams }>(
    '/api/elections/:id/rounds/:rid/close',
    adminOnly,
    async (request) => {
      const { id, rid } = request.params;
      const record = await service.closeRound(getAdminId(request), id, rid);
      return toAdminElectionDTO(record, clock.now());
    },
  );
}
