import { SOCKET_EVENTS, type AdminElectionDTO, type VoterStateDTO } from '@voto/shared';
import type { Notifier } from '../ports';
import type { RealtimeServer } from '../realtime/gateway';
import { adminRoom, voterRoom } from '../realtime/rooms';

/**
 * Notificador de produção: emite o estado inteiro pelo Socket.IO, só para a sala de quem
 * deve recebê-lo (architecture.md §7).
 */
export class SocketNotifier implements Notifier {
  /**
   * Cria o notificador sobre o servidor de tempo real (pode ser ligado ao HTTP depois).
   *
   * @param io - Servidor de tempo real criado por `createRealtimeServer`.
   */
  constructor(private readonly io: RealtimeServer) {}

  /**
   * Envia `admin:state` aos admins que acompanham a eleição.
   *
   * @param electionId - Eleição observada.
   * @param state - Estado completo para o painel.
   */
  adminState(electionId: string, state: AdminElectionDTO): void {
    this.io.to(adminRoom(electionId)).emit(SOCKET_EVENTS.ADMIN_STATE, state);
  }

  /**
   * Envia `voter:state` só ao eleitor destinatário (sigilo: ninguém vê o estado de outro).
   *
   * @param voterId - Eleitor destinatário.
   * @param state - Estado completo para a tela do eleitor.
   */
  voterState(voterId: string, state: VoterStateDTO): void {
    this.io.to(voterRoom(voterId)).emit(SOCKET_EVENTS.VOTER_STATE, state);
  }
}
