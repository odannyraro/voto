import { DomainError } from '@voto/domain';
import type { ErrorDTO } from '@voto/shared';
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

/** Erros que o próprio Fastify lança (JSON malformado, tipo de conteúdo não suportado...). */
function isFastifyClientError(error: unknown): error is Error & { statusCode: number } {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  const { statusCode } = error;
  return (
    typeof statusCode === 'number' &&
    statusCode >= BAD_REQUEST &&
    statusCode < INTERNAL_SERVER_ERROR
  );
}

/** Resume os problemas de um `ZodError` numa frase, um `campo: motivo` por problema. */
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
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof DomainError) {
    const status = statusForErrorCode(error.code);
    return { status, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof ZodError) {
    return {
      status: BAD_REQUEST,
      body: { error: { code: 'VALIDATION_ERROR', message: describeZodIssues(error) } },
    };
  }
  if (isFastifyClientError(error)) {
    return {
      status: error.statusCode,
      body: { error: { code: 'VALIDATION_ERROR', message: error.message } },
    };
  }
  return {
    status: INTERNAL_SERVER_ERROR,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
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
    const body: ErrorDTO = { error: { code: 'NOT_FOUND', message } };
    return reply.status(NOT_FOUND).send(body);
  });
}
