import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/api-client';
import * as socketClient from '../src/api/socket-client';
import { voterApi } from '../src/api/voter-api';
import { App } from '../src/App';
import { createFakeSocket } from './utils/fake-socket';
import { makeVoterStateDTO } from './utils/factories';
import { renderWithProviders } from './utils/render-with-providers';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('VoterEntryPage', () => {
  it('persists the voter session and navigates to its page after the code is accepted', async () => {
    const createSession = vi.spyOn(voterApi, 'createSession').mockResolvedValue({
      token: 'voter-token',
      electionId: 'election-1',
      electionName: 'Student Council',
    });
    vi.spyOn(voterApi, 'getState').mockResolvedValue(
      makeVoterStateDTO({ phase: 'WAITING', electionName: 'Student Council' }),
    );
    vi.spyOn(socketClient, 'createSocketClient').mockReturnValue(createFakeSocket());
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.type(screen.getByRole('textbox', { name: 'Código de acesso' }), 'abc23456');
    await user.click(screen.getByRole('button', { name: 'Entrar para votar' }));
    await screen.findByRole('heading', { name: 'Aguardando o início da eleição' });

    expect({
      request: createSession.mock.calls[0]?.[0],
      storedSession: sessionStorage.getItem('voto:voter-session'),
      destination: screen.queryByRole('heading', { name: 'Sessão de votação' }) !== null,
    }).toEqual({
      request: { code: 'ABC23456' },
      storedSession: JSON.stringify({ token: 'voter-token', electionId: 'election-1' }),
      destination: true,
    });
  });

  it.each(['', 'ABC2345', 'ABC234567'])(
    'does not start a session for invalid code %j',
    async (code) => {
      const createSession = vi.spyOn(voterApi, 'createSession');
      const user = userEvent.setup();
      renderWithProviders(<App />);

      fireEvent.change(screen.getByRole('textbox', { name: 'Código de acesso' }), {
        target: { value: code },
      });
      await user.click(screen.getByRole('button', { name: 'Entrar para votar' }));

      expect({
        sessionStarted: createSession.mock.calls.length > 0,
        validationMessage: screen.getByRole('alert').textContent,
      }).toEqual({
        sessionStarted: false,
        validationMessage: 'Informe um código válido com oito caracteres.',
      });
    },
  );

  it.each([
    {
      status: 404,
      code: 'INVALID_CODE',
      apiMessage: 'Unknown voter code',
    },
    {
      status: 403,
      code: 'VOTER_REVOKED',
      apiMessage: 'This voter code was revoked',
    },
  ] as const)(
    'shows a distinct message when the API rejects a code with $code',
    async ({ status, code, apiMessage }) => {
      vi.spyOn(voterApi, 'createSession').mockRejectedValue(
        new ApiError(status, { code, message: apiMessage }),
      );
      const user = userEvent.setup();
      renderWithProviders(<App />);

      await user.type(screen.getByRole('textbox', { name: 'Código de acesso' }), 'ABC23456');
      await user.click(screen.getByRole('button', { name: 'Entrar para votar' }));

      expect({
        alert: screen.getByRole('alert').textContent,
        storedSession: sessionStorage.getItem('voto:voter-session'),
      }).toEqual({
        alert:
          code === 'INVALID_CODE'
            ? 'Este código não é válido. Confira os caracteres e tente novamente.'
            : 'Este código foi revogado. Peça ajuda à administração da eleição.',
        storedSession: null,
      });
    },
  );

  it('shows a readable message when the session request cannot reach the API', async () => {
    vi.spyOn(voterApi, 'createSession').mockRejectedValue(new TypeError('Network unavailable'));
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.type(screen.getByRole('textbox', { name: 'Código de acesso' }), 'ABC23456');
    await user.click(screen.getByRole('button', { name: 'Entrar para votar' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Não foi possível iniciar sua sessão. Tente novamente.',
    );
  });
});
