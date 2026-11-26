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
    outcomeMessage: 'A candidate was elected.',
    decision: 'Elected candidate: Ana',
    candidateCounts: 'Ana: 2Bia: 1',
    validVotes: 3,
    blankVotes: 1,
    tiebreakMessage: 'No tie-break rule was applied.',
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
    outcomeMessage: 'A runoff is required.',
    decision: 'Runoff candidates: Ana and Bia',
    candidateCounts: 'Ana: 2Bia: 2',
    validVotes: 4,
    blankVotes: 1,
    tiebreakMessage: 'A tie-break rule was applied.',
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
    outcomeMessage: 'No valid votes were cast.',
    decision: null,
    candidateCounts: 'Ana: 0Bia: 0',
    validVotes: 0,
    blankVotes: 2,
    tiebreakMessage: 'No tie-break rule was applied.',
  },
];

describe('VoterSessionPage final phases', () => {
  it('confirms that the voter submitted their vote in the VOTED phase', async () => {
    renderVoterState(makeVoterStateDTO({ phase: 'VOTED', roundId: 'round-closed' }));
    const heading = await screen.findByRole('heading', { name: 'Vote recorded' });

    expect({
      heading: heading.textContent,
      results: screen.queryByRole('list', { name: 'Candidate vote counts' }),
    }).toEqual({ heading: 'Vote recorded', results: null });
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
        await screen.findByRole('heading', { name: 'Results for President' }),
      ).toBeInTheDocument();
      expect({
        outcome: screen.getByRole('status').textContent,
        decision:
          screen.queryByText(/^(Elected candidate|Runoff candidates):/)?.textContent ?? null,
        candidateCounts: screen.getByRole('list', { name: 'Candidate vote counts' }).textContent,
        validVotes: screen.getByText(`Valid votes: ${validVotes}`).textContent,
        blankVotes: screen.getByText(`Blank votes: ${blankVotes}`).textContent,
        tiebreak: screen.getByText(tiebreakMessage).textContent,
        hasDerivedTotal: screen.queryByText(/Total votes:/) !== null,
      }).toEqual({
        outcome: outcomeMessage,
        decision,
        candidateCounts,
        validVotes: `Valid votes: ${validVotes}`,
        blankVotes: `Blank votes: ${blankVotes}`,
        tiebreak: tiebreakMessage,
        hasDerivedTotal: false,
      });
    },
  );

  it('shows that the election has ended in the FINISHED phase', async () => {
    renderVoterState(makeVoterStateDTO({ phase: 'FINISHED' }));
    const heading = await screen.findByRole('heading', { name: 'Election finished' });

    expect({
      heading: heading.textContent,
      results: screen.queryByRole('list', { name: 'Candidate vote counts' }),
    }).toEqual({ heading: 'Election finished', results: null });
  });
});
