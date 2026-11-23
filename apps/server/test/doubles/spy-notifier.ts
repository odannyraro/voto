import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import type { Notifier } from '../../src/ports';

/** Chamada registrada de `adminState`. */
export interface AdminStateCall {
  readonly electionId: string;
  readonly state: AdminElectionDTO;
}

/** Chamada registrada de `voterState`. */
export interface VoterStateCall {
  readonly voterId: string;
  readonly state: VoterStateDTO;
}

/** Notificador de teste: não envia nada, só registra o que recebeu. */
export class SpyNotifier implements Notifier {
  readonly adminStates: AdminStateCall[] = [];
  readonly voterStates: VoterStateCall[] = [];

  /**
   * Registra o estado enviado ao admin.
   *
   * @param electionId - Eleição observada.
   * @param state - Estado enviado.
   */
  adminState(electionId: string, state: AdminElectionDTO): void {
    this.adminStates.push({ electionId, state });
  }

  /**
   * Registra o estado enviado a um eleitor.
   *
   * @param voterId - Eleitor destinatário.
   * @param state - Estado enviado.
   */
  voterState(voterId: string, state: VoterStateDTO): void {
    this.voterStates.push({ voterId, state });
  }
}
