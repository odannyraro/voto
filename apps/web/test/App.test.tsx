import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('shows the voter entry form on the home route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox', { name: 'Código de acesso' })).toBeInTheDocument();
  });

  it('does not show the home heading on an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('textbox', { name: 'Código de acesso' })).not.toBeInTheDocument();
  });
});
