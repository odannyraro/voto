import { credentialVotersBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../ports';
import type { ElectionService } from '../services/election-service';
import { toAdminElectionDTO } from '../services/presenters';
import { getAdminId, type AuthHooks } from './auth-plugin';
import type { ElectionParams } from './election-routes';
import { parse } from './validate';

/** O que as rotas de eleitores precisam. */
interface VoterRoutesDeps {
  readonly service: ElectionService;
  /** Fornece o `serverNow` das respostas. */
  readonly clock: Clock;
  readonly hooks: AuthHooks;
}

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
export function registerVoterRoutes(app: FastifyInstance, deps: VoterRoutesDeps): void {
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
