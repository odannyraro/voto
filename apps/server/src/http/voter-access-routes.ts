import { castVoteBodySchema, voterSessionBodySchema } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import type { VoterService } from '../services/voter-service';
import { getVoterIds, type AuthHooks } from './auth-plugin';
import { parse } from './validate';

/** O que as rotas de acesso do eleitor precisam. */
export interface VoterAccessRouteDeps {
  readonly service: VoterService;
  readonly hooks: AuthHooks;
}

/**
 * Registra as rotas de acesso do eleitor (architecture.md §6.2): entrar com o código
 * (`POST /api/voter/session`, pública), consultar o estado da tela (`GET /api/voter/state`)
 * e votar (`POST /api/voter/votes`, 204).
 *
 * @param app - Instância Fastify que recebe as rotas.
 * @param deps - Serviço do eleitor e os *preHandlers* de papel.
 */
export function registerVoterAccessRoutes(app: FastifyInstance, deps: VoterAccessRouteDeps): void {
  app.post('/api/voter/session', async (request) => {
    const { code } = parse(voterSessionBodySchema, request.body);
    return deps.service.startSession(code);
  });

  app.get('/api/voter/state', { preHandler: deps.hooks.requireVoter }, async (request) => {
    const { voterId, electionId } = getVoterIds(request);
    return deps.service.getState(voterId, electionId);
  });

  app.post('/api/voter/votes', { preHandler: deps.hooks.requireVoter }, async (request, reply) => {
    const vote = parse(castVoteBodySchema, request.body);
    const { voterId, electionId } = getVoterIds(request);
    await deps.service.castVote(voterId, electionId, vote);
    return reply.code(204).send();
  });
}
