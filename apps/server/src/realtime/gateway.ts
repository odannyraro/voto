import type { Server as HttpServer } from 'node:http';
import { SOCKET_EVENTS, type ClientToServerEvents, type ServerToClientEvents } from '@voto/shared';
import { Server, type Socket } from 'socket.io';
import type { Clock } from '../ports';
import type { AuthService, TokenClaims } from '../services/auth';
import type { ElectionService } from '../services/election-service';
import { toAdminElectionDTO } from '../services/presenters';
import { adminRoom, electionVotersRoom, voterRoom } from './rooms';

/** Dados guardados em cada socket depois do handshake. */
export interface SocketData {
  /** Claims do token validado no handshake. */
  claims: TokenClaims;
}

/** Servidor Socket.IO tipado com os eventos de `@voto/shared`. */
export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Socket de um cliente conectado ao `RealtimeServer`. */
type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** O que o gateway usa dos serviços do app. */
export interface RealtimeDeps {
  /** Valida o token do handshake. */
  readonly auth: AuthService;
  /** Confere o dono da eleição e lê o estado dela (com o prazo vencido já aplicado). */
  readonly elections: ElectionService;
  readonly clock: Clock;
}

/**
 * Cria o servidor de tempo real ainda sem servidor HTTP. Ele nasce antes do app porque o
 * `SocketNotifier` (dependência do app) precisa dele; o `attachRealtime` o liga depois.
 *
 * @returns O servidor Socket.IO tipado, sem servir o arquivo do cliente.
 */
export function createRealtimeServer(): RealtimeServer {
  return new Server({ serveClient: false });
}

/**
 * Liga o servidor de tempo real ao HTTP: só aceita conexões com token válido, põe o eleitor
 * nas salas dele e atende o `admin:watch` do admin (architecture.md §7).
 *
 * @param io - Servidor criado por `createRealtimeServer`.
 * @param httpServer - Servidor HTTP do Fastify (o mesmo da API, sem porta extra).
 * @param deps - Serviços do app usados no handshake e no `admin:watch`.
 */
export function attachRealtime(
  io: RealtimeServer,
  httpServer: HttpServer,
  deps: RealtimeDeps,
): void {
  io.attach(httpServer);
  io.use((socket, next) => {
    authenticate(socket, deps.auth).then(
      () => next(),
      () => next(new Error('INVALID_TOKEN')),
    );
  });
  io.on('connection', (socket) => {
    onConnection(socket, deps);
  });
}

/**
 * Valida o token enviado em `auth.token` no handshake e guarda as claims no socket.
 *
 * @param socket - Socket ainda em handshake.
 * @param auth - Serviço que verifica o token.
 * @returns Promise resolvida quando o token é válido.
 * @throws {HttpError} 401 `INVALID_TOKEN` se o token faltar ou for inválido.
 */
async function authenticate(socket: RealtimeSocket, auth: AuthService): Promise<void> {
  const token: unknown = socket.handshake.auth['token'];
  socket.data.claims = await auth.verifyToken(typeof token === 'string' ? token : '');
}

/**
 * Prepara um socket recém-aceito conforme o papel do token: o eleitor entra direto nas
 * salas dele; o admin só entra numa sala quando pede (`admin:watch`).
 *
 * @param socket - Socket autenticado.
 * @param deps - Serviços usados pelo `admin:watch`.
 */
function onConnection(socket: RealtimeSocket, deps: RealtimeDeps): void {
  const { claims } = socket.data;
  if (claims.role === 'voter') {
    void socket.join([electionVotersRoom(claims.electionId), voterRoom(claims.voterId)]);
    return;
  }
  const { adminId } = claims;
  socket.on(SOCKET_EVENTS.ADMIN_WATCH, (payload) => {
    void watchElection(socket, adminId, payload, deps);
  });
}

/**
 * Atende o `admin:watch`: confere o dono, põe o socket na sala da eleição e envia o estado
 * atual na hora. Pedido inválido, eleição inexistente ou alheia só não entram na sala: o
 * cliente se ressincroniza por HTTP (`GET /elections/:id`), onde o erro aparece.
 *
 * @param socket - Socket do admin.
 * @param adminId - Admin dono do token.
 * @param payload - Corpo do evento; vem do cliente, então pode não ter o formato esperado.
 * @param deps - Serviços para ler a eleição e montar o estado.
 */
async function watchElection(
  socket: RealtimeSocket,
  adminId: string,
  payload: { electionId: string } | null,
  deps: RealtimeDeps,
): Promise<void> {
  try {
    const electionId = payload?.electionId ?? '';
    const record = await deps.elections.getElection(adminId, electionId);
    await socket.join(adminRoom(electionId));
    socket.emit(SOCKET_EVENTS.ADMIN_STATE, toAdminElectionDTO(record, deps.clock.now()));
  } catch {
    // 403/404 (ou falha do repositório): o socket fica fora da sala, sem derrubar a conexão.
  }
}
