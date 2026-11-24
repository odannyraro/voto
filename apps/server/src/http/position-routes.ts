import { createPositionBodySchema, queueBodySchema, updatePositionBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { toAdminElectionDTO } from '../services/presenters';
import type { AdminRouteDeps, ElectionParams } from './admin-route-deps';
import { getAdminId } from './auth-plugin';
import { parse } from './validate';

/** Parâmetros de rota `/elections/:id/positions/:pid`. */
interface PositionParams extends ElectionParams {
  readonly pid: string;
}

/**
 * Registra as rotas de cargos e da fila de votação (architecture.md §6.1): criar, editar e
 * remover cargo, aplicar a ordem e pedir a sugestão. As rotas só traduzem HTTP e delegam
 * ao `ElectionService`.
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de eleições, relógio e os *preHandlers* de papel.
 */
export function registerPositionRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { service, clock } = deps;
  const adminOnly = { preHandler: deps.hooks.requireAdmin };

  app.post<{ Params: ElectionParams }>(
    '/api/elections/:id/positions',
    adminOnly,
    async (request, reply) => {
      const body = parse(createPositionBodySchema, request.body);
      const record = await service.addPosition(getAdminId(request), request.params.id, body);
      return reply.code(201).send(toAdminElectionDTO(record, clock.now()));
    },
  );

  app.patch<{ Params: PositionParams }>(
    '/api/elections/:id/positions/:pid',
    adminOnly,
    async (request) => {
      const body = parse(updatePositionBodySchema, request.body);
      const { id, pid } = request.params;
      const record = await service.updatePosition(getAdminId(request), id, pid, body);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.delete<{ Params: PositionParams }>(
    '/api/elections/:id/positions/:pid',
    adminOnly,
    async (request) => {
      const { id, pid } = request.params;
      const record = await service.removePosition(getAdminId(request), id, pid);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.put<{ Params: ElectionParams }>('/api/elections/:id/queue', adminOnly, async (request) => {
    const body = parse(queueBodySchema, request.body);
    const record = await service.applyQueueOrder(
      getAdminId(request),
      request.params.id,
      body.positionIds,
    );
    return toAdminElectionDTO(record, clock.now());
  });

  app.get<{ Params: ElectionParams }>(
    '/api/elections/:id/queue/suggestion',
    adminOnly,
    async (request) => ({
      positionIds: await service.suggestQueueOrder(getAdminId(request), request.params.id),
    }),
  );
}
