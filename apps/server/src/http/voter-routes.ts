import { credentialVotersBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { toAdminElectionDTO } from '../services/presenters';
import type { AdminRouteDeps, ElectionParams } from './admin-route-deps';
import { getAdminId } from './auth-plugin';
import { parse } from './validate';

/** Parâmetros de rota `/elections/:id/voters/:vid`. */
interface VoterParams extends ElectionParams {
  readonly vid: string;
}

/**
 * Registra as rotas de credenciamento (architecture.md §6.1): gerar códigos de eleitor e
 * revogar um eleitor. As rotas só traduzem HTTP e delegam ao `ElectionService`.
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de eleições, relógio e os *preHandlers* de papel.
 */
export function registerVoterRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { service, clock } = deps;
  const adminOnly = { preHandler: deps.hooks.requireAdmin };

  app.post<{ Params: ElectionParams }>(
    '/api/elections/:id/voters',
    adminOnly,
    async (request, reply) => {
      const body = parse(credentialVotersBodySchema, request.body);
      const { record, codes } = await service.credentialVoters(
        getAdminId(request),
        request.params.id,
        body,
      );
      return reply.code(201).send({ codes, election: toAdminElectionDTO(record, clock.now()) });
    },
  );

  app.delete<{ Params: VoterParams }>(
    '/api/elections/:id/voters/:vid',
    adminOnly,
    async (request) => {
      const { id, vid } = request.params;
      const record = await service.revokeVoter(getAdminId(request), id, vid);
      return toAdminElectionDTO(record, clock.now());
    },
  );
}
