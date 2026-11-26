import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/api-client';
import { voterApi } from '../src/api/voter-api';
import { App } from '../src/App';
import { renderWithProviders } from './utils/render-with-providers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VoterEntryPage', () => {
  it('starts a voter session with the normalized eight-character code', async () => {
    const createSession = vi.spyOn(voterApi, 'createSession').mockResolvedValue({
      token: 'voter-token',
      electionId: 'election-1',
      electionName: 'Student Council',
    });
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.type(screen.getByRole('textbox', { name: 'Voter code' }), 'abc23456');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    expect(createSession).toHaveBeenCalledWith({ code: 'ABC23456' });
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

  it('announces an API error when the code is rejected', async () => {
    vi.spyOn(voterApi, 'createSession').mockRejectedValue(
      new ApiError(404, { code: 'INVALID_CODE', message: 'Invalid voter code' }),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.type(screen.getByRole('textbox', { name: 'Voter code' }), 'ABC23456');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/INVALID_CODE.*Invalid voter code/);
  });

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
