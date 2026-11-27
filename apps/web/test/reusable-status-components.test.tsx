import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorDTO } from '@voto/shared';
import { Countdown } from '../src/components/Countdown';
import { ErrorMessage } from '../src/components/ErrorMessage';
import { renderWithProviders } from './utils/render-with-providers';

const COUNTDOWN_CLOCK = {
  deadline: '2026-11-26T12:00:02.000Z',
  serverNow: '2026-11-26T12:00:00.000Z',
  clientNowAtSync: '2026-11-26T12:00:00.000Z',
};

const INVALID_CODE_ERROR = {
  error: {
    code: 'INVALID_CODE',
    message: 'The voter code is invalid.',
  },
} satisfies ErrorDTO;

afterEach(() => {
  vi.useRealTimers();
});

describe('Countdown', () => {
  it('updates the displayed time as the deadline approaches', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));
    renderWithProviders(<Countdown clock={COUNTDOWN_CLOCK} />);

    expect(screen.getByRole('timer', { name: 'Tempo restante' })).toHaveTextContent('00:02');

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByRole('timer', { name: 'Tempo restante' })).toHaveTextContent('00:01');
  });

  it('shows zero when the deadline expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));
    renderWithProviders(<Countdown clock={COUNTDOWN_CLOCK} />);

    expect(screen.getByRole('timer', { name: 'Tempo restante' })).toHaveTextContent('00:02');

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole('timer', { name: 'Tempo restante' })).toHaveTextContent('00:00');
  });
});

describe('ErrorMessage', () => {
  it('announces the error code and readable message', () => {
    renderWithProviders(<ErrorMessage error={INVALID_CODE_ERROR} />);

    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent('Este código não é válido.');
  });
});
