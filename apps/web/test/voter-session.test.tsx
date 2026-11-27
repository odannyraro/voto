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
      await screen.findByRole('heading', { name: 'Aguardando o início da eleição' }),
    ).toBeInTheDocument();
    expect(getState).toHaveBeenCalledWith(SESSION_TOKEN);
  });

  it('reports when the session route has no saved voter credentials', async () => {
    renderWithProviders(<App />, { initialEntries: ['/votar'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sessão de eleitor não encontrada. Entre novamente com seu código.',
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
      'Sessão de eleitor não encontrada. Entre novamente com seu código.',
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
      await screen.findByRole('heading', { name: 'Aguardando o início da eleição' }),
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
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });

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
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });

    act(() => {
      socket.disconnect();
      socket.reconnect();
    });

    await waitFor(() => expect(getState).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'President' })).toBeInTheDocument();
  });

  it('does not replace a socket update with a reconnect response resolved in the same batch', async () => {
    let resolveReconnect: ((state: VoterStateDTO) => void) | undefined;
    const reconnectState = new Promise<VoterStateDTO>((resolve) => {
      resolveReconnect = resolve;
    });
    vi.spyOn(voterApi, 'getState')
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'WAITING' }))
      .mockReturnValueOnce(reconnectState);
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });
    act(() => {
      socket.disconnect();
      socket.reconnect();
    });

    await act(async () => {
      socket.emitVoterState(makeVoterStateDTO({ phase: 'FINISHED' }));
      resolveReconnect?.(makeVoterStateDTO({ phase: 'WAITING' }));
      await reconnectState;
    });

    expect(screen.getByRole('heading', { name: 'Eleição encerrada' })).toBeInTheDocument();
  });

  it('retains the latest reconnect response when an earlier request finishes later', async () => {
    let resolveFirstReconnect: ((state: VoterStateDTO) => void) | undefined;
    const firstReconnect = new Promise<VoterStateDTO>((resolve) => {
      resolveFirstReconnect = resolve;
    });
    vi.spyOn(voterApi, 'getState')
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'WAITING' }))
      .mockReturnValueOnce(firstReconnect)
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'FINISHED' }));
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });

    act(() => {
      socket.disconnect();
      socket.reconnect();
      socket.disconnect();
      socket.reconnect();
    });
    await screen.findByRole('heading', { name: 'Eleição encerrada' });
    await act(async () => {
      resolveFirstReconnect?.(makeVoterStateDTO({ phase: 'WAITING' }));
      await firstReconnect;
    });

    expect(screen.getByRole('heading', { name: 'Eleição encerrada' })).toBeInTheDocument();
  });

  it('accepts a reconnect response newer than a socket update from before the disconnect', async () => {
    vi.spyOn(voterApi, 'getState')
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'WAITING' }))
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'FINISHED' }));
    const socket = createFakeSocket();
    renderWithProviders(<VoterSessionPage token={SESSION_TOKEN} />, {
      socketProvider: ({ children }) => (
        <SocketProvider token={SESSION_TOKEN} createClient={() => socket}>
          {children}
        </SocketProvider>
      ),
    });
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });

    act(() => {
      socket.emitVoterState(makeVoterStateDTO({ phase: 'VOTING' }));
      socket.disconnect();
      socket.reconnect();
    });

    expect(await screen.findByRole('heading', { name: 'Eleição encerrada' })).toBeInTheDocument();
  });

  it('reloads the voter state when the session page is remounted', async () => {
    const getState = vi
      .spyOn(voterApi, 'getState')
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'WAITING' }))
      .mockResolvedValueOnce(makeVoterStateDTO({ phase: 'FINISHED' }));
    const socket = createFakeSocket();
    const createClient = (): typeof socket => socket;
    const { rerender } = renderWithProviders(
      <SocketProvider token={SESSION_TOKEN} createClient={createClient}>
        <VoterSessionPage token={SESSION_TOKEN} />
      </SocketProvider>,
    );
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });

    rerender(
      <SocketProvider token={SESSION_TOKEN} createClient={createClient}>
        <VoterSessionPage key="remounted" token={SESSION_TOKEN} />
      </SocketProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Eleição encerrada' })).toBeInTheDocument();
    expect(getState).toHaveBeenCalledTimes(2);
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sua sessão expirou. Entre novamente.',
    );
  });
});
