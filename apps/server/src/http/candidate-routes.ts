import { createCandidateBodySchema, updateCandidateBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { toAdminElectionDTO } from '../services/presenters';
import type { AdminRouteDeps, ElectionParams } from './admin-route-deps';
import { getAdminId } from './auth-plugin';
import { parse } from './validate';

/** Parâmetros de rota `/elections/:id/candidates/:cid`. */
interface CandidateParams extends ElectionParams {
  readonly cid: string;
}

/** Parâmetros de rota `/elections/:id/positions/:pid/candidates/:cid`. */
interface AttachParams extends CandidateParams {
  readonly pid: string;
}

/**
 * Registra as rotas de candidatos (architecture.md §6.1): criar, editar e remover candidato
 * e anexar um candidato existente a outro cargo. As rotas só traduzem HTTP e delegam ao
 * `ElectionService`.
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de eleições, relógio e os *preHandlers* de papel.
 */
export function registerCandidateRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { service, clock } = deps;
  const adminOnly = { preHandler: deps.hooks.requireAdmin };

  app.post<{ Params: ElectionParams }>(
    '/api/elections/:id/candidates',
    adminOnly,
    async (request, reply) => {
      const body = parse(createCandidateBodySchema, request.body);
      const record = await service.addCandidate(getAdminId(request), request.params.id, body);
      return reply.code(201).send(toAdminElectionDTO(record, clock.now()));
    },
  );

  app.patch<{ Params: CandidateParams }>(
    '/api/elections/:id/candidates/:cid',
    adminOnly,
    async (request) => {
      const body = parse(updateCandidateBodySchema, request.body);
      const { id, cid } = request.params;
      const record = await service.updateCandidate(getAdminId(request), id, cid, body);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.delete<{ Params: CandidateParams }>(
    '/api/elections/:id/candidates/:cid',
    adminOnly,
    async (request) => {
      const { id, cid } = request.params;
      const record = await service.removeCandidate(getAdminId(request), id, cid);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.post<{ Params: AttachParams }>(
    '/api/elections/:id/positions/:pid/candidates/:cid',
    adminOnly,
    async (request) => {
      const { id, pid, cid } = request.params;
      const record = await service.attachCandidate(getAdminId(request), id, pid, cid);
      return toAdminElectionDTO(record, clock.now());
    },
  );
}
