import { ERROR_CODES, type ErrorDTO } from '@voto/shared';

const API_PREFIX = '/api';

/** Opções de autenticação e serialização para uma chamada ao contrato REST. */
export interface ApiRequestOptions {
  /** Token Bearer opcional da sessão atual. */
  readonly token?: string;
  /** Verbo HTTP usado pelo endpoint. */
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Valor serializado como corpo JSON quando presente. */
  readonly body?: unknown;
  /** Sinal opcional para cancelar a chamada. */
  readonly signal?: AbortSignal;
}

/**
 * Erro controlado de transporte da API, mantendo o status e o erro compartilhado quando válido.
 *
 * @param status - Status HTTP da resposta.
 * @param error - Erro validado no formato `ErrorDTO`, quando fornecido pelo servidor.
 * @param message - Mensagem específica para respostas que não contêm um `ErrorDTO` válido.
 */
export class ApiError extends Error {
  /** Status HTTP associado à falha. */
  public readonly status: number;
  /** Código e mensagem compartilhados, ausentes quando a resposta não seguiu `ErrorDTO`. */
  public readonly error: ErrorDTO['error'] | undefined;

  /**
   * Cria um erro de API que preserva o status HTTP e o payload validado.
   *
   * @param status - Status HTTP da resposta.
   * @param error - Erro validado no formato `ErrorDTO`, quando fornecido pelo servidor.
   * @param message - Mensagem específica para respostas que não contêm um `ErrorDTO` válido.
   * @returns Instância com nome, status, erro tipado e mensagem legível.
   */
  public constructor(status: number, error?: ErrorDTO['error'], message?: string) {
    super(message ?? error?.message ?? `Request failed with HTTP ${status}.`);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

/**
 * Verifica se um valor desconhecido pode ser tratado como objeto JSON.
 *
 * @param value - Valor recebido de uma resposta HTTP.
 * @returns `true` para objetos não nulos que não são arrays.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida o formato e o código de erro compartilhado antes de expor o payload.
 *
 * @param value - Corpo JSON desconhecido retornado pelo servidor.
 * @returns `true` somente para um corpo que segue o contrato `ErrorDTO`.
 */
function isErrorDTO(value: unknown): value is ErrorDTO {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  const { code, message } = value.error;
  return typeof message === 'string' && ERROR_CODES.some((knownCode) => knownCode === code);
}

/**
 * Converte o corpo de uma resposta em JSON e explicita respostas não JSON como erro de API.
 *
 * @param response - Resposta recebida do transporte HTTP.
 * @returns Corpo JSON sem afirmar prematuramente o seu DTO.
 * @throws {ApiError} Quando o corpo está vazio ou não é JSON válido.
 */
async function readJsonResponse(response: Response): Promise<unknown> {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new ApiError(
      response.status,
      undefined,
      `Response with HTTP ${response.status} was not valid JSON.`,
    );
  }
}

/**
 * Faz uma chamada REST sob `/api`, enviando dados JSON e convertendo falhas em `ApiError`.
 *
 * @param endpoint - Caminho iniciado por `/`, relativo ao prefixo `/api`.
 * @param options - Token, método, corpo JSON e sinal de cancelamento da chamada.
 * @returns DTO tipado em sucesso, ou `undefined` quando o servidor responde `204`.
 * @throws {ApiError} Quando a resposta HTTP falha ou o corpo não contém JSON válido.
 * @throws {TypeError} Quando o corpo não pode ser serializado como JSON ou a rede falha.
 */
export async function apiRequest<T>(
  endpoint: `/${string}`,
  options: ApiRequestOptions = {},
): Promise<T | undefined> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token !== undefined) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    const serializedBody = JSON.stringify(options.body);
    if (serializedBody === undefined) {
      throw new TypeError('Request body must be serializable as JSON.');
    }

    body = serializedBody;
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_PREFIX}${endpoint}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined;
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    if (isErrorDTO(responseBody)) {
      throw new ApiError(response.status, responseBody.error);
    }

    throw new ApiError(
      response.status,
      undefined,
      `Error response with HTTP ${response.status} did not match ErrorDTO.`,
    );
  }

  return responseBody as T;
}
