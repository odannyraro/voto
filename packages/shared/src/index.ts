/** Nome do sistema, compartilhado entre servidor e frontend. */
export const APP_NAME = 'Voto';
export * from './dto';
export { ERROR_CODES, type ErrorCode } from './error-codes';
export {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from './socket-events';
export * from './api-schemas';
