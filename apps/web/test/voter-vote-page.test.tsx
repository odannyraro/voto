import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/api-client';
import { SocketProvider } from '../src/api/socket-provider';
import { voterApi } from '../src/api/voter-api';
import { VoterSessionPage } from '../src/features/voter/VoterSessionPage';
import { createFakeSocket } from './utils/fake-socket';
import { makeRoundView, makeVoterStateDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const SESSION_TOKEN = 'voter-token';
const ROUND_ID = 'round-1';
const SERVER_NOW = '2026-11-26T12:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * Monta uma sessão com uma rodada aberta e um socket substituível.
 *
 * @returns Renderiza a página sob os providers de teste.
 */
function renderVotingSession(): void {
  vi.spyOn(voterApi, 'getState').mockResolvedValue(
    makeVoterStateDTO({
      phase: 'VOTING',
      serverNow: SERVER_NOW,
      round: makeRoundView({
        roundId: ROUND_ID,
        positionTitle: 'President',
        candidates: [
          { id: 'candidate-ana', name: 'Ana' },
          { id: 'candidate-bia', name: 'Bia' },
        ],
        deadline: '2026-11-26T12:00:30.000Z',
      }),
    }),
  );
  const socket = createFakeSocket();
  renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
    socketProvider: ({ children }) => (
      <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
        {children}
      </SocketProvider>
    ),
  });
}

describe('VoterVotePage', () => {
  it('submits the selected candidate vote once', async () => {
    let resolveVote: (() => void) | undefined;
    const pendingVote = new Promise<void>((resolve) => {
      resolveVote = resolve;
    });
    const castVote = vi.spyOn(voterApi, 'castVote').mockReturnValue(pendingVote);
    renderVotingSession();
    const voteButton = await screen.findByRole('button', { name: 'Vote for Ana' });

    act(() => {
      fireEvent.click(voteButton);
      fireEvent.click(voteButton);
    });
    expect(castVote).toHaveBeenCalledOnce();
    await act(async () => {
      resolveVote?.();
      await pendingVote;
    });

    expect({
      request: castVote.mock.calls[0],
      requests: castVote.mock.calls.length,
      submitted: screen.getByRole('status').textContent,
      voteButtonsDisabled: screen
        .getByRole('button', { name: 'Vote for Bia' })
        .hasAttribute('disabled'),
    }).toEqual({
      request: [SESSION_TOKEN, { roundId: ROUND_ID, choice: 'candidate-ana' }],
      requests: 1,
      submitted: 'Vote recorded. Waiting for the next update.',
      voteButtonsDisabled: true,
    });
  });

  it('submits BLANK when the voter chooses a blank vote', async () => {
    const castVote = vi.spyOn(voterApi, 'castVote').mockResolvedValue();
    const user = userEvent.setup();
    renderVotingSession();

    await user.click(await screen.findByRole('button', { name: 'Cast a blank vote' }));

    expect(castVote).toHaveBeenCalledWith(SESSION_TOKEN, {
      roundId: ROUND_ID,
      choice: 'BLANK',
    });
  });

  it('prevents another vote after the server reports that this voter already voted', async () => {
    vi.spyOn(voterApi, 'castVote').mockRejectedValue(
      new ApiError(409, {
        code: 'VOTER_ALREADY_VOTED',
        message: 'This voter has already voted in this round.',
      }),
    );
    const user = userEvent.setup();
    renderVotingSession();
    const voteButton = await screen.findByRole('button', { name: 'Vote for Ana' });

    await user.click(voteButton);

    expect({
      error: screen.getByRole('alert').textContent,
      disabled: voteButton.hasAttribute('disabled'),
    }).toEqual({
      error: 'VOTER_ALREADY_VOTEDThis voter has already voted in this round.',
      disabled: true,
    });
  });

  it('prevents voting after the server reports that the round expired', async () => {
    vi.spyOn(voterApi, 'castVote').mockRejectedValue(
      new ApiError(410, { code: 'ROUND_EXPIRED', message: 'This round has expired.' }),
    );
    const user = userEvent.setup();
    renderVotingSession();
    const voteButton = await screen.findByRole('button', { name: 'Vote for Ana' });

    await user.click(voteButton);

    expect({
      error: screen.getByRole('alert').textContent,
      disabled: voteButton.hasAttribute('disabled'),
    }).toEqual({
      error: 'ROUND_EXPIREDThis round has expired.',
      disabled: true,
    });
  });

  it('shows the remaining time using the server-synchronized clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SERVER_NOW));
    renderVotingSession();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:30');
  });
});
