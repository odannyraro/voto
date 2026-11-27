import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundResultDTO, VoterStateDTO } from '@voto/shared';
import { SocketProvider } from '../src/api/socket-provider';
import { voterApi } from '../src/api/voter-api';
import { VoterSessionPage } from '../src/features/voter/VoterSessionPage';
import { createFakeSocket } from './utils/fake-socket';
import { makeVoterStateDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const SESSION_TOKEN = 'voter-token';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Renderiza a página com o snapshot REST da fase solicitada e um socket isolado.
 *
 * @param state - Snapshot do servidor que a sessão deve apresentar.
 * @returns Monta a sessão do eleitor sob os providers de teste.
 */
function renderVoterState(state: VoterStateDTO): void {
  vi.spyOn(voterApi, 'getState').mockResolvedValue(state);
  const socket = createFakeSocket();
  renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
    socketProvider: ({ children }) => (
      <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
        {children}
      </SocketProvider>
    ),
  });
}

const RESULT_CASES: Array<{
  readonly description: string;
  readonly result: RoundResultDTO;
  readonly outcomeMessage: string;
  readonly decision: string | null;
  readonly candidateCounts: string;
  readonly validVotes: number;
  readonly blankVotes: number;
  readonly tiebreakMessage: string;
}> = [
  {
    description: 'elected candidate',
    result: {
      roundId: 'round-elected',
      positionTitle: 'President',
      kind: 'FIRST',
      counts: [
        { candidateId: 'candidate-ana', name: 'Ana', votes: 2 },
        { candidateId: 'candidate-bia', name: 'Bia', votes: 1 },
      ],
      blank: 1,
      validVotes: 3,
      outcome: 'ELECTED',
      electedCandidateId: 'candidate-ana',
      tiebreakApplied: false,
    },
    outcomeMessage: 'Uma pessoa candidata foi eleita.',
    decision: 'Pessoa eleita: Ana',
    candidateCounts: 'Ana: 2 votosBia: 1 votos',
    validVotes: 3,
    blankVotes: 1,
    tiebreakMessage: 'Não foi necessário aplicar a regra de desempate.',
  },
  {
    description: 'runoff required',
    result: {
      roundId: 'round-runoff',
      positionTitle: 'President',
      kind: 'FIRST',
      counts: [
        { candidateId: 'candidate-ana', name: 'Ana', votes: 2 },
        { candidateId: 'candidate-bia', name: 'Bia', votes: 2 },
      ],
      blank: 1,
      validVotes: 4,
      outcome: 'RUNOFF_REQUIRED',
      runoffCandidateIds: ['candidate-ana', 'candidate-bia'],
      tiebreakApplied: true,
    },
    outcomeMessage: 'É necessário realizar um segundo turno.',
    decision: 'Pessoas classificadas para o segundo turno: Ana e Bia',
    candidateCounts: 'Ana: 2 votosBia: 2 votos',
    validVotes: 4,
    blankVotes: 1,
    tiebreakMessage: 'Foi aplicada a regra de desempate.',
  },
  {
    description: 'no valid votes',
    result: {
      roundId: 'round-no-votes',
      positionTitle: 'President',
      kind: 'FIRST',
      counts: [
        { candidateId: 'candidate-ana', name: 'Ana', votes: 0 },
        { candidateId: 'candidate-bia', name: 'Bia', votes: 0 },
      ],
      blank: 2,
      validVotes: 0,
      outcome: 'NO_VALID_VOTES',
      tiebreakApplied: false,
    },
    outcomeMessage: 'Não houve votos válidos.',
    decision: null,
    candidateCounts: 'Ana: 0 votosBia: 0 votos',
    validVotes: 0,
    blankVotes: 2,
    tiebreakMessage: 'Não foi necessário aplicar a regra de desempate.',
  },
];

describe('VoterSessionPage final phases', () => {
  it('confirms that the voter submitted their vote in the VOTED phase', async () => {
    renderVoterState(makeVoterStateDTO({ phase: 'VOTED', roundId: 'round-closed' }));
    const heading = await screen.findByRole('heading', { name: 'Voto registrado' });

    expect({
      heading: heading.textContent,
      results: screen.queryByRole('list', { name: 'Contagem de votos por candidatura' }),
    }).toEqual({ heading: 'Voto registrado', results: null });
  });

  it.each(RESULT_CASES)(
    'shows only the server result fields for $description',
    async ({
      result,
      outcomeMessage,
      decision,
      candidateCounts,
      validVotes,
      blankVotes,
      tiebreakMessage,
    }) => {
      renderVoterState(makeVoterStateDTO({ phase: 'RESULTS', result }));

      expect(
        await screen.findByRole('heading', { name: 'Resultado: President' }),
      ).toBeInTheDocument();
      expect({
        outcome: screen.getByRole('status').textContent,
        decision:
          screen.queryByText(/^(Pessoa eleita|Pessoas classificadas para o segundo turno):/)
            ?.textContent ?? null,
        candidateCounts: screen.getByRole('list', { name: 'Contagem de votos por candidatura' })
          .textContent,
        validVotes: screen.getByText(`Votos válidos: ${validVotes}`).textContent,
        blankVotes: screen.getByText(`Votos em branco: ${blankVotes}`).textContent,
        tiebreak: screen.getByText(tiebreakMessage).textContent,
        hasDerivedTotal: screen.queryByText(/Total votes:/) !== null,
      }).toEqual({
        outcome: outcomeMessage,
        decision,
        candidateCounts,
        validVotes: `Votos válidos: ${validVotes}`,
        blankVotes: `Votos em branco: ${blankVotes}`,
        tiebreak: tiebreakMessage,
        hasDerivedTotal: false,
      });
    },
  );

  it('shows that the election has ended in the FINISHED phase', async () => {
    renderVoterState(makeVoterStateDTO({ phase: 'FINISHED' }));
    const heading = await screen.findByRole('heading', { name: 'Eleição encerrada' });

    expect({
      heading: heading.textContent,
      results: screen.queryByRole('list', { name: 'Contagem de votos por candidatura' }),
    }).toEqual({ heading: 'Eleição encerrada', results: null });
  });
});
