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
          <h2>Voto registrado</h2>
          <p>Seu voto foi registrado. Aguarde a divulgação do resultado.</p>
        </section>
      );
    case 'RESULTS':
      return <VoterResults result={state.result} />;
    case 'FINISHED':
      return (
        <section>
          <h2>Eleição encerrada</h2>
          <p>Esta eleição foi finalizada.</p>
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
      <h2 id="results-heading">Resultado: {result.positionTitle}</h2>
      <p role="status">{getOutcomeMessage(result.outcome)}</p>
      {result.electedCandidateId !== undefined && (
        <p>Pessoa eleita: {getCandidateName(result.electedCandidateId, result.counts)}</p>
      )}
      {result.runoffCandidateIds !== undefined && (
        <p>
          Pessoas classificadas para o segundo turno:{' '}
          {result.runoffCandidateIds
            .map((candidateId) => getCandidateName(candidateId, result.counts))
            .join(' e ')}
        </p>
      )}
      <ul aria-label="Contagem de votos por candidatura">
        {result.counts.map((count) => (
          <li key={count.candidateId}>
            {count.name}: {count.votes} votos
          </li>
        ))}
      </ul>
      <p>Votos válidos: {result.validVotes}</p>
      <p>Votos em branco: {result.blank}</p>
      <p>
        {result.tiebreakApplied
          ? 'Foi aplicada a regra de desempate.'
          : 'Não foi necessário aplicar a regra de desempate.'}
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
      return 'Uma pessoa candidata foi eleita.';
    case 'RUNOFF_REQUIRED':
      return 'É necessário realizar um segundo turno.';
    case 'NO_VALID_VOTES':
      return 'Não houve votos válidos.';
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
