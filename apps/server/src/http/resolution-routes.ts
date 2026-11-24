import { cancelPositionBodySchema, openRunoffBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { toAdminElectionDTO } from '../services/presenters';
import type { AdminRouteDeps, ElectionParams } from './admin-route-deps';
import { getAdminId } from './auth-plugin';
import { parse } from './validate';

/** Parâmetros de rota `/elections/:id/positions/:pid`. */
interface PositionParams extends ElectionParams {
  readonly pid: string;
}

/** Parâmetros de rota `/elections/:id/rounds/:rid`. */
interface RoundParams extends ElectionParams {
  readonly rid: string;
}

/**
 * Registra as rotas que decidem o que acontece depois de uma rodada (architecture.md §6.1):
 * 2º turno, liberação do resultado, adiar ou cancelar cargo, anular rodada, encerrar a
 * eleição e desfazer. As rotas só traduzem HTTP e delegam ao `ElectionService`.
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço de eleições, relógio e os *preHandlers* de papel.
 */
export function registerResolutionRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { service, clock } = deps;
  const adminOnly = { preHandler: deps.hooks.requireAdmin };

  app.post<{ Params: PositionParams }>(
    '/api/elections/:id/positions/:pid/runoff',
    adminOnly,
    async (request, reply) => {
      const { id, pid } = request.params;
      const body = parse(openRunoffBodySchema, request.body ?? {});
      const input = { positionId: pid, ...body };
      const record = await service.openRunoff(getAdminId(request), id, input);
      return reply.code(201).send(toAdminElectionDTO(record, clock.now()));
    },
  );

  app.post<{ Params: RoundParams }>(
    '/api/elections/:id/rounds/:rid/release',
    adminOnly,
    async (request) => {
      const { id, rid } = request.params;
      const record = await service.releaseResults(getAdminId(request), id, rid);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.post<{ Params: PositionParams }>(
    '/api/elections/:id/positions/:pid/defer',
    adminOnly,
    async (request) => {
      const { id, pid } = request.params;
      const record = await service.deferPosition(getAdminId(request), id, pid);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.post<{ Params: PositionParams }>(
    '/api/elections/:id/positions/:pid/cancel',
    adminOnly,
    async (request) => {
      const { id, pid } = request.params;
      const { confirmTitle } = parse(cancelPositionBodySchema, request.body);
      const record = await service.cancelPosition(getAdminId(request), id, pid, confirmTitle);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.post<{ Params: RoundParams }>(
    '/api/elections/:id/rounds/:rid/annul',
    adminOnly,
    async (request) => {
      const { id, rid } = request.params;
      const record = await service.annulRound(getAdminId(request), id, rid);
      return toAdminElectionDTO(record, clock.now());
    },
  );

  app.post<{ Params: ElectionParams }>('/api/elections/:id/undo', adminOnly, async (request) => {
    const record = await service.undo(getAdminId(request), request.params.id);
    return toAdminElectionDTO(record, clock.now());
  });

  app.post<{ Params: ElectionParams }>('/api/elections/:id/finish', adminOnly, async (request) => {
    const record = await service.finishElection(getAdminId(request), request.params.id);
    return toAdminElectionDTO(record, clock.now());
  });
}
