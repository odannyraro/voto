import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { httpErrorFor } from './errors';

/** Página de entrada do front: o roteador do navegador decide o que mostrar em cada caminho. */
const ENTRY_PAGE = 'index.html';

// Caminhos do servidor (API e Socket.IO): sem rota, são 404 em JSON, nunca a página do front.
const SERVER_PATH = /^\/(api|socket\.io)(\/|\?|$)/;

/**
 * Serve o build do front pelo próprio servidor, para a aplicação ter uma única origem (§13).
 * Os arquivos do build são servidos como estão; qualquer outro `GET` que não seja da API
 * recebe a página de entrada, porque os caminhos de tela (ex.: `/admin/elections/x`) só
 * existem no roteador do navegador.
 *
 * @param app - Instância Fastify, ainda não iniciada (deve vir depois de `registerErrorHandling`).
 * @param distDir - Caminho absoluto da pasta do build do front (com o `index.html`).
 */
export function registerStatic(app: FastifyInstance, distDir: string): void {
  // Sem curinga: cada arquivo do build vira uma rota própria, e o curinga abaixo fica livre
  // para a página de entrada.
  void app.register(fastifyStatic, { root: distDir, wildcard: false });

  app.get('/*', (request, reply) => {
    if (SERVER_PATH.test(request.url)) {
      throw httpErrorFor('NOT_FOUND', `Route ${request.method} ${request.url} not found`);
    }
    return reply.sendFile(ENTRY_PAGE);
  });
}
