import { DomainError } from '@voto/domain';
import type { ErrorCode, ErrorDTO } from '@voto/shared';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from './errors';
import { statusForErrorCode } from './error-status';

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const INTERNAL_SERVER_ERROR = 500;

/** Resposta de erro pronta: status HTTP e corpo no formato `ErrorDTO`. */
interface ErrorResponse {
  readonly status: number;
  readonly body: ErrorDTO;
}

/**
 * Monta uma resposta de erro no formato da API, para que todo ramo do tratador produza o
 * mesmo `ErrorDTO` e só diga o que muda: status, código e mensagem.
 *
 * @param status - Status HTTP da resposta.
 * @param code - Código de erro da API.
 * @param message - Mensagem que vai para o cliente.
 * @returns Status e corpo `ErrorDTO`.
 */
function errorResponse(status: number, code: ErrorCode, message: string): ErrorResponse {
  return { status, body: { error: { code, message } } };
}

/**
 * Reconhece os erros de cliente que o próprio Fastify lança antes da rota (JSON malformado,
 * tipo de conteúdo não suportado...), para respondê-los como erro de validação e não como 500.
 *
 * @param error - O que foi lançado.
 * @returns `true` se for um `Error` com `statusCode` numérico na faixa 4xx.
 */
function isFastifyClientError(error: unknown): error is Error & { statusCode: number } {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  const { statusCode } = error;
  return (
    typeof statusCode === 'number' &&
    statusCode >= BAD_REQUEST &&
    statusCode < INTERNAL_SERVER_ERROR
  );
}

/**
 * Resume os problemas de um `ZodError` numa frase, para o cliente saber o que corrigir.
 *
 * @param error - Erro de validação do Zod.
 * @returns Um `campo: motivo` por problema, separados por `; `. Problemas no corpo inteiro
 *   (sem campo) aparecem só com o motivo.
 */
function describeZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
}

/**
 * Traduz qualquer erro lançado numa rota na resposta HTTP padrão da API (architecture.md §6.3).
 * Erros desconhecidos viram 500 genérico: a mensagem interna nunca vai para o cliente.
 *
 * @param error - O que a rota lançou.
 * @returns Status e corpo `ErrorDTO` da resposta.
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
  if (error instanceof DomainError) {
    return errorResponse(statusForErrorCode(error.code), error.code, error.message);
  }
  if (error instanceof ZodError) {
    return errorResponse(BAD_REQUEST, 'VALIDATION_ERROR', describeZodIssues(error));
  }
  if (isFastifyClientError(error)) {
    return errorResponse(error.statusCode, 'VALIDATION_ERROR', error.message);
  }
  return errorResponse(INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Internal server error');
}

/**
 * Registra no app o tratador global de erros e o de rota inexistente, para que toda
 * resposta de erro siga o `ErrorDTO`. Deve rodar antes do registro das rotas.
 *
 * @param app - Instância Fastify que receberá os tratadores.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const response = toErrorResponse(error);
    // Só o 500 é bug nosso; os demais são erros esperados do cliente e não poluem o log.
    if (response.status === INTERNAL_SERVER_ERROR)
      request.log.error({ err: error }, 'Unhandled error');
    return reply.status(response.status).send(response.body);
  });

  app.setNotFoundHandler((request, reply) => {
    const message = `Route ${request.method} ${request.url} not found`;
    const { status, body } = errorResponse(NOT_FOUND, 'NOT_FOUND', message);
    return reply.status(status).send(body);
  });
}
