import { act, screen, waitFor } from '@testing-library/react';
import type { VoterStateDTO } from '@voto/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/api-client';
import * as socketClient from '../src/api/socket-client';
import { SocketProvider } from '../src/api/socket-provider';
import { voterApi } from '../src/api/voter-api';
import { App } from '../src/App';
import { VoterSessionPage } from '../src/features/voter/VoterSessionPage';
import { createFakeSocket } from './utils/fake-socket';
import { makeVoterStateDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

const SESSION_TOKEN = 'voter-token';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('VoterSessionPage', () => {
  it('uses the persisted token to load the session route', async () => {
    sessionStorage.setItem(
      'voto:voter-session',
      JSON.stringify({ token: SESSION_TOKEN, electionId: 'election-1' }),
    );
    const getState = vi
      .spyOn(voterApi, 'getState')
      .mockResolvedValue(makeVoterStateDTO({ phase: 'WAITING', electionName: 'Student Council' }));
    vi.spyOn(socketClient, 'createSocketClient').mockReturnValue(createFakeSocket());
    renderWithProviders(<App />, { initialEntries: ['/votar'] });

    expect(
      await screen.findByRole('heading', { name: 'Waiting for election to start' }),
    ).toBeInTheDocument();
    expect(getState).toHaveBeenCalledWith(SESSION_TOKEN);
  });

  it('reports when the session route has no saved voter credentials', async () => {
    renderWithProviders(<App />, { initialEntries: ['/votar'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Voter session not found. Join an election again.',
    );
  });

  it.each([
    ['malformed credentials', '{'],
    ['incomplete credentials', JSON.stringify({ token: SESSION_TOKEN })],
    ['empty credentials', JSON.stringify({ token: '', electionId: 'election-1' })],
  ])('reports a missing session for %s', async (_scenario, storedSession) => {
    sessionStorage.setItem('voto:voter-session', storedSession);
    renderWithProviders(<App />, { initialEntries: ['/votar'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Voter session not found. Join an election again.',
    );
  });

  it('displays the waiting state loaded from the voter session', async () => {
    vi.spyOn(voterApi, 'getState').mockResolvedValue(
      makeVoterStateDTO({ phase: 'WAITING', electionName: 'Student Council' }),
    );
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });

    expect(
      await screen.findByRole('heading', { name: 'Waiting for election to start' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Student Council')).toBeInTheDocument();
  });

  it('replaces the displayed voter state when the socket publishes a new snapshot', async () => {
    vi.spyOn(voterApi, 'getState').mockResolvedValue(makeVoterStateDTO({ phase: 'WAITING' }));
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });
    await screen.findByRole('heading', { name: 'Waiting for election to start' });

    act(() => {
      socket.emitVoterState(makeVoterStateDTO({ phase: 'VOTING' }));
    });

    expect(screen.getByRole('heading', { name: 'President' })).toBeInTheDocument();
  });

  it('keeps a newer socket snapshot when the initial REST response arrives late', async () => {
    let resolveInitialState: ((state: VoterStateDTO) => void) | undefined;
    const initialState = new Promise<VoterStateDTO>((resolve) => {
      resolveInitialState = resolve;
    });
    const getState = vi.spyOn(voterApi, 'getState').mockReturnValue(initialState);
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });
    await waitFor(() => expect(getState).toHaveBeenCalledOnce());

    act(() => {
      socket.emitVoterState(makeVoterStateDTO({ phase: 'VOTING' }));
    });
    await act(async () => {
      resolveInitialState?.(makeVoterStateDTO({ phase: 'WAITING' }));
      await initialState;
    });

    expect(screen.getByRole('heading', { name: 'President' })).toBeInTheDocument();
  });

  it('reloads the voter state after the socket reconnects', async () => {
    const getState = vi
      .spyOn(voterApi, 'getState')
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'WAITING' }))
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'VOTING' }));
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });
    await screen.findByRole('heading', { name: 'Waiting for election to start' });

    act(() => {
      socket.disconnect();
      socket.reconnect();
    });

    await waitFor(() => expect(getState).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'President' })).toBeInTheDocument();
  });

  it('displays the API error when the initial state cannot be loaded', async () => {
    vi.spyOn(voterApi, 'getState').mockRejectedValue(
      new ApiError(401, { code: 'INVALID_TOKEN', message: 'Session expired' }),
    );
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('INVALID_TOKENSession expired');
  });
});
