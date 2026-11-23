import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';

/** Porta de notificação em tempo real: empurra o estado inteiro a quem está conectado. */
export interface Notifier {
  /**
   * Envia o estado da eleição aos admins que a acompanham.
   *
   * @param electionId - Eleição observada.
   * @param state - Estado completo para o painel.
   */
  adminState(electionId: string, state: AdminElectionDTO): void;

  /**
   * Envia a um eleitor o que a tela dele deve mostrar.
   *
   * @param voterId - Eleitor destinatário.
   * @param state - Estado completo para a tela do eleitor.
   */
  voterState(voterId: string, state: VoterStateDTO): void;
}
