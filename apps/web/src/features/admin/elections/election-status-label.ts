import type { ElectionSummaryDTO } from '@voto/shared';

/**
 * Traduz o estado oficial da eleição para a situação mostrada à administração.
 *
 * @param status - Estado da eleição devolvido pelo servidor.
 * @returns Situação apresentada em português.
 */
export function getElectionStatusLabel(status: ElectionSummaryDTO['status']): string {
  switch (status) {
    case 'DRAFT':
      return 'Em preparação';
    case 'OPEN':
      return 'Aberta';
    case 'FINISHED':
      return 'Encerrada';
  }
}
