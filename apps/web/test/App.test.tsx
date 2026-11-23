import { APP_NAME } from '@voto/shared';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('shows the app name as the heading of the home route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading')).toHaveTextContent(APP_NAME);
  });

  it('does not show the home heading on an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('heading', { name: APP_NAME })).not.toBeInTheDocument();
  });
});
