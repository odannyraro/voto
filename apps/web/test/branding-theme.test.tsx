import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('application brand and theme controls', () => {
  it('shows the Vota Ae brand, an admin shortcut, and a theme toggle on the voter entry page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect({
      brand: screen.queryByRole('link', { name: 'Vota Ae' }),
      adminShortcut: screen.queryByRole('link', { name: 'Acesso administrativo' }),
      themeToggle: screen.queryByRole('button', { name: 'Ativar tema escuro' }),
    }).toEqual({
      brand: expect.any(HTMLElement),
      adminShortcut: expect.any(HTMLElement),
      themeToggle: expect.any(HTMLElement),
    });
  });

  it('switches themes and persists the selection for the next visit', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      expect(localStorage.getItem('vota-ae:theme')).toBe('dark');
    });
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
