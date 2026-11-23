import type { AdminElectionDTO, VoterStateDTO } from './dto';

/** Nomes dos eventos de tempo real, no padrão `<papel>:<ação>` (architecture.md §7). */
export const SOCKET_EVENTS = {
  /** Servidor → admin: estado completo da eleição observada. */
  ADMIN_STATE: 'admin:state',
  /** Servidor → eleitor: o que a tela dele deve mostrar agora. */
  VOTER_STATE: 'voter:state',
  /** Admin → servidor: pede para observar uma eleição sua. */
  ADMIN_WATCH: 'admin:watch',
} as const;

/** Eventos que o servidor emite (formato do Socket.IO: nome → função do ouvinte). */
export interface ServerToClientEvents {
  [SOCKET_EVENTS.ADMIN_STATE]: (state: AdminElectionDTO) => void;
  [SOCKET_EVENTS.VOTER_STATE]: (state: VoterStateDTO) => void;
}

/** Eventos que o cliente emite. */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.ADMIN_WATCH]: (payload: { electionId: string }) => void;
}
