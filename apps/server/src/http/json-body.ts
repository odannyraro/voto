import type { FastifyInstance } from 'fastify';

const JSON_CONTENT_TYPE = 'application/json';

/**
 * Troca o parser de JSON do Fastify por um que aceita corpo vazio como "sem corpo". O front
 * manda `Content-Type: application/json` em todo POST, inclusive nas rotas sem corpo (abrir,
 * fechar, liberar, desfazer...), e o parser padrão as recusava com 400 antes de chegar à rota.
 * As rotas que exigem corpo continuam recusando-o, agora pelo próprio schema (Zod); JSON
 * malformado continua 400, porque o resto do parse é o do Fastify (com a proteção contra
 * `__proto__` e `constructor`).
 *
 * @param app - Instância Fastify, ainda não iniciada.
 */
export function registerLenientJsonBody(app: FastifyInstance): void {
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser(JSON_CONTENT_TYPE);
  app.addContentTypeParser(JSON_CONTENT_TYPE, { parseAs: 'string' }, (request, body, done) => {
    // Com `parseAs: 'string'` o corpo já chega como texto; o `toString` só satisfaz o tipo.
    const text = body.toString();
    if (text === '') {
      done(null, undefined);
      return;
    }
    parseJson(request, text, done);
  });
}
