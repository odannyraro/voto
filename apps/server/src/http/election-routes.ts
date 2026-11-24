import { createElectionBodySchema, updateElectionBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { toAdminElectionDTO } from '../services/presenters';
import type { AdminRouteDeps, ElectionParams } from './admin-route-deps';
import { getAdminId } from './auth-plugin';
import { parse } from './validate';

/**
 * Registra as rotas de eleição do admin (architecture.md §6.1): criar, listar, ler e editar.
 * Todas exigem token de admin; as rotas só traduzem HTTP e delegam ao `ElectionService`.
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de eleições, relógio e os *preHandlers* de papel.
 */
export function registerElectionRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { service, clock } = deps;
  const adminOnly = { preHandler: deps.hooks.requireAdmin };

  app.get('/api/elections', adminOnly, async (request) =>
    service.listElections(getAdminId(request)),
  );

  app.post('/api/elections', adminOnly, async (request, reply) => {
    const body = parse(createElectionBodySchema, request.body);
    const record = await service.createElection(getAdminId(request), body);
    return reply.code(201).send(toAdminElectionDTO(record, clock.now()));
  });

  app.get<{ Params: ElectionParams }>('/api/elections/:id', adminOnly, async (request) => {
    const record = await service.getElection(getAdminId(request), request.params.id);
    return toAdminElectionDTO(record, clock.now());
  });

  app.patch<{ Params: ElectionParams }>('/api/elections/:id', adminOnly, async (request) => {
    const body = parse(updateElectionBodySchema, request.body);
    const record = await service.updateElection(getAdminId(request), request.params.id, body);
    return toAdminElectionDTO(record, clock.now());
  });
}
