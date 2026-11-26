import type { RoundOutcome, RoundResultDTO, VoterStateDTO } from '@voto/shared';
import type { ReactElement } from 'react';

type FinalVoterState = Extract<VoterStateDTO, { readonly phase: 'VOTED' | 'RESULTS' | 'FINISHED' }>;

/** Propriedades para apresentar uma fase final devolvida pelo servidor. */
export interface VoterFinalStateProps {
  /** Snapshot de confirmação, resultado liberado ou eleição encerrada. */
  readonly state: FinalVoterState;
}

/**
 * Apresenta somente os dados da fase final presentes no snapshot do servidor.
 *
 * @param props - Estado final do eleitor recebido pela API ou pelo socket.
 * @returns Confirmação de voto, apuração liberada ou mensagem de encerramento.
 * @throws {Error} Se o DTO contiver uma fase final não suportada.
 */
export function VoterFinalState({ state }: VoterFinalStateProps): ReactElement {
  switch (state.phase) {
    case 'VOTED':
      return (
        <section>
          <h2>Vote recorded</h2>
          <p>Your vote has been recorded. Waiting for results.</p>
        </section>
      );
    case 'RESULTS':
      return <VoterResults result={state.result} />;
    case 'FINISHED':
      return (
        <section>
          <h2>Election finished</h2>
          <p>This election has ended.</p>
        </section>
      );
    default:
      return assertNever(state);
  }
}

/**
 * Mostra a apuração e os totais exatamente como foram liberados pelo servidor.
 *
 * @param result - DTO da rodada fechada, sem cálculos locais.
 * @returns Posição, desfecho, contagens e indicadores fornecidos pelo DTO.
 */
function VoterResults({ result }: { readonly result: RoundResultDTO }): ReactElement {
  return (
    <section aria-labelledby="results-heading">
      <h2 id="results-heading">Results for {result.positionTitle}</h2>
      <p role="status">{getOutcomeMessage(result.outcome)}</p>
      {result.electedCandidateId !== undefined && (
        <p>Elected candidate: {getCandidateName(result.electedCandidateId, result.counts)}</p>
      )}
      {result.runoffCandidateIds !== undefined && (
        <p>
          Runoff candidates:{' '}
          {result.runoffCandidateIds
            .map((candidateId) => getCandidateName(candidateId, result.counts))
            .join(' and ')}
        </p>
      )}
      <ul aria-label="Candidate vote counts">
        {result.counts.map((count) => (
          <li key={count.candidateId}>
            {count.name}: {count.votes}
          </li>
        ))}
      </ul>
      <p>Valid votes: {result.validVotes}</p>
      <p>Blank votes: {result.blank}</p>
      <p>
        {result.tiebreakApplied
          ? 'A tie-break rule was applied.'
          : 'No tie-break rule was applied.'}
      </p>
    </section>
  );
}

/**
 * Resolve o nome legível de um candidato mencionado pelo DTO da apuração.
 *
 * @param candidateId - Identificador fornecido no resultado da rodada.
 * @param counts - Linhas da apuração que contêm os nomes dos candidatos.
 * @returns Nome da apuração ou o próprio identificador quando não há correspondência.
 */
function getCandidateName(candidateId: string, counts: RoundResultDTO['counts']): string {
  return counts.find((count) => count.candidateId === candidateId)?.name ?? candidateId;
}

/**
 * Traduz o desfecho oficial sem reavaliar o resultado da rodada.
 *
 * @param outcome - Desfecho calculado e enviado pelo servidor.
 * @returns Mensagem legível correspondente ao desfecho.
 * @throws {Error} Se surgir um desfecho que não pertence ao contrato compartilhado.
 */
function getOutcomeMessage(outcome: RoundOutcome): string {
  switch (outcome) {
    case 'ELECTED':
      return 'A candidate was elected.';
    case 'RUNOFF_REQUIRED':
      return 'A runoff is required.';
    case 'NO_VALID_VOTES':
      return 'No valid votes were cast.';
    default:
      return assertNever(outcome);
  }
}

/**
 * Falha explicitamente quando um union discriminado ganha um valor não tratado.
 *
 * @param value - Valor que deveria ter sido esgotado pelo `switch`.
 * @returns Nunca retorna; lança erro para indicar quebra do contrato em tempo de execução.
 * @throws {Error} Sempre que uma fase ou desfecho desconhecido chegar à interface.
 */
function assertNever(value: never): never {
  throw new Error(`Unsupported voter result: ${String(value)}`);
}
