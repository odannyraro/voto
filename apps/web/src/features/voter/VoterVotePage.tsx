import type { CastVoteBody, ErrorDTO, RoundView } from '@voto/shared';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ApiError } from '../../api/api-client';
import { voterApi } from '../../api/voter-api';
import { Countdown } from '../../components/Countdown';
import { ErrorMessage } from '../../components/ErrorMessage';

/** Propriedades para apresentar e registrar o voto de uma rodada aberta. */
export interface VoterVotePageProps {
  /** Token emitido ao eleitor para autenticar o voto. */
  readonly token: string;
  /** Cédula pública recebida do servidor, sem contagens parciais. */
  readonly round: RoundView;
  /** Hora do servidor recebida junto ao estado da rodada. */
  readonly serverNow: string;
  /** Hora local em que o snapshot com `serverNow` foi recebido. */
  readonly clientNowAtSync: string;
}

/**
 * Apresenta a cédula da rodada atual e envia uma única escolha pela API REST.
 *
 * @param props - Credencial, cédula e amostras de relógio recebidas do servidor.
 * @returns Candidatos, opção de voto branco, prazo e resultado do envio.
 */
export function VoterVotePage({
  token,
  round,
  serverNow,
  clientNowAtSync,
}: VoterVotePageProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [isBallotUnavailable, setIsBallotUnavailable] = useState(false);
  const [error, setError] = useState<ErrorDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submissionInProgress = useRef(false);
  const isDisabled = isSubmitting || hasVoted || isBallotUnavailable;

  /**
   * Envia a escolha e bloqueia a cédula após sucesso ou rejeição terminal.
   *
   * @param choice - Identificador do candidato ou `BLANK`.
   * @returns Resolve após atualizar o estado do envio e apresentar eventual erro.
   */
  async function submitVote(choice: CastVoteBody['choice']): Promise<void> {
    if (submissionInProgress.current || isDisabled) {
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);
    setError(null);
    setErrorMessage(null);

    try {
      await voterApi.castVote(token, { roundId: round.roundId, choice });
      setHasVoted(true);
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.error !== undefined) {
        setError({ error: requestError.error });
        if (
          requestError.error.code === 'VOTER_ALREADY_VOTED' ||
          requestError.error.code === 'ROUND_EXPIRED'
        ) {
          setIsBallotUnavailable(true);
        }
      } else {
        setErrorMessage('Não foi possível enviar seu voto. Tente novamente.');
      }
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="ballot-heading">
      <h2 id="ballot-heading">{round.positionTitle}</h2>
      <Countdown
        clock={{
          deadline: round.deadline,
          serverNow,
          clientNowAtSync,
        }}
      />
      {error !== null && <ErrorMessage error={error} />}
      {errorMessage !== null && <p role="alert">{errorMessage}</p>}
      {isSubmitting && <p role="status">Registrando seu voto...</p>}
      {hasVoted && <p role="status">Voto registrado. Aguarde a próxima atualização.</p>}
      <fieldset disabled={isDisabled}>
        <legend>Escolha uma pessoa candidata ou vote em branco</legend>
        {round.candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            disabled={isDisabled}
            onClick={() => void submitVote(candidate.id)}
          >
            Votar em {candidate.name}
          </button>
        ))}
        <button type="button" disabled={isDisabled} onClick={() => void submitVote('BLANK')}>
          Votar em branco
        </button>
      </fieldset>
    </section>
  );
}
