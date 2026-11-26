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

    await user.type(screen.getByRole('textbox', { name: 'Voter code' }), 'abc23456');
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await screen.findByRole('heading', { name: 'Waiting for election to start' });

    expect({
      request: createSession.mock.calls[0]?.[0],
      storedSession: sessionStorage.getItem('voto:voter-session'),
      destination: screen.queryByRole('heading', { name: 'Voter session' }) !== null,
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

      fireEvent.change(screen.getByRole('textbox', { name: 'Voter code' }), {
        target: { value: code },
      });
      await user.click(screen.getByRole('button', { name: 'Enter' }));

      expect({
        sessionStarted: createSession.mock.calls.length > 0,
        validationMessage: screen.getByRole('alert').textContent,
      }).toEqual({
        sessionStarted: false,
        validationMessage: 'Enter a valid eight-character voter code.',
      });
    },
  );

  it.each([
    {
      status: 404,
      code: 'INVALID_CODE',
      apiMessage: 'Unknown voter code',
      message: 'This voter code is invalid or does not exist.',
    },
    {
      status: 403,
      code: 'VOTER_REVOKED',
      apiMessage: 'This voter code was revoked',
      message: 'This voter code has been revoked. Contact the election administrator.',
    },
  ] as const)(
    'shows a distinct message when the API rejects a code with $code',
    async ({ status, code, apiMessage, message }) => {
      vi.spyOn(voterApi, 'createSession').mockRejectedValue(
        new ApiError(status, { code, message: apiMessage }),
      );
      const user = userEvent.setup();
      renderWithProviders(<App />);

      await user.type(screen.getByRole('textbox', { name: 'Voter code' }), 'ABC23456');
      await user.click(screen.getByRole('button', { name: 'Enter' }));

      expect({
        alert: screen.getByRole('alert').textContent,
        storedSession: sessionStorage.getItem('voto:voter-session'),
      }).toEqual({
        alert: `${code}${message}`,
        storedSession: null,
      });
    },
  );

  it('shows a readable message when the session request cannot reach the API', async () => {
    vi.spyOn(voterApi, 'createSession').mockRejectedValue(new TypeError('Network unavailable'));
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.type(screen.getByRole('textbox', { name: 'Voter code' }), 'ABC23456');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Unable to start your session. Please try again.',
    );
  });
});
