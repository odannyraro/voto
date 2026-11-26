import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { httpErrorFor } from './errors';

/** Página de entrada do front: o roteador do navegador decide o que mostrar em cada caminho. */
const ENTRY_PAGE = 'index.html';

// Caminhos do servidor (API e Socket.IO): sem rota, são 404 em JSON, nunca a página do front.
const SERVER_PATH = /^\/(api|socket\.io)(\/|\?|$)/;

// Arquivo com extensão no último trecho do caminho, antes da query (ex.: `/assets/app-old.js?v=2`):
// telas do roteador não têm extensão, então é um arquivo do build que não existe (aba aberta
// antes de um deploy) e recebe 404, em vez do HTML que o navegador tentaria rodar como script.
const FILE_PATH = /^[^?]*\.[^/?]+(\?|$)/;

/**
 * Serve o build do front pelo próprio servidor, para a aplicação ter uma única origem (§13).
 * Os arquivos do build são servidos como estão; qualquer outro `GET` que não seja da API nem
 * de um arquivo recebe a página de entrada, porque os caminhos de tela (ex.:
 * `/admin/elections/x`) só existem no roteador do navegador.
 *
 * @param app - Instância Fastify, ainda não iniciada (deve vir depois de `registerErrorHandling`).
 * @param distDir - Caminho absoluto da pasta do build do front (com o `index.html`).
 */
export function registerStatic(app: FastifyInstance, distDir: string): void {
  // Sem curinga: cada arquivo do build vira uma rota própria, e o curinga abaixo fica livre
  // para a página de entrada.
  void app.register(fastifyStatic, { root: distDir, wildcard: false });

  app.get('/*', (request, reply) => {
    if (SERVER_PATH.test(request.url) || FILE_PATH.test(request.url)) {
      throw httpErrorFor('NOT_FOUND', `Route ${request.method} ${request.url} not found`);
    }
    return reply.sendFile(ENTRY_PAGE);
  });
}
