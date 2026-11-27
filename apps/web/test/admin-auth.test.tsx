import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { createMockApiServer } from './msw/mock-api-server';
import { createFakeSocket } from './utils/fake-socket';
import { renderWithProviders } from './utils/render-with-providers';

const ADMIN_TOKEN_KEY = 'voto:admin-token';
const mockApi = createMockApiServer();

beforeAll(() => {
  mockApi.listen();
});

afterEach(() => {
  mockApi.reset();
  sessionStorage.clear();
});

beforeEach(() => {
  let adminAuthenticated = false;
  mockApi.use(
    http.post('*/api/admin/login', async ({ request }) => {
      const body = (await request.json()) as { username?: string; password?: string };
      if (body.username !== 'admin' || body.password !== 'password') {
        return HttpResponse.json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } },
          { status: 401 },
        );
      }

      adminAuthenticated = true;
      return HttpResponse.json({ token: 'mock-admin-token' });
    }),
    http.get('*/api/admin/me', ({ request }) => {
      if (
        request.headers.get('Authorization') !== 'Bearer mock-admin-token' ||
        !adminAuthenticated
      ) {
        return HttpResponse.json(
          { error: { code: 'INVALID_TOKEN', message: 'Invalid token' } },
          { status: 401 },
        );
      }

      return HttpResponse.json({ id: 'admin-1', username: 'admin' });
    }),
  );
});

afterAll(() => {
  mockApi.close();
});

describe('administrator authentication', () => {
  it('authenticates, loads the administrator identity, and opens the dashboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin/login'] });

    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect({
      heading: await screen.findByRole('heading', { name: 'Painel administrativo' }),
      identity: screen.getByText('Sessão iniciada como admin'),
      storedToken: sessionStorage.getItem(ADMIN_TOKEN_KEY),
    }).toEqual({
      heading: expect.any(HTMLElement),
      identity: expect.any(HTMLElement),
      storedToken: 'mock-admin-token',
    });
  });

  it('shows an accessible error when credentials are invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin/login'] });

    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos.');
  });

  it('shows a readable message when the login response is unavailable', async () => {
    mockApi.use(
      http.post('*/api/admin/login', () =>
        HttpResponse.text('Service unavailable', { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin/login'] });

    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível entrar. Confira sua conexão e tente novamente.',
    );
  });

  it('redirects an unauthenticated visitor away from a protected admin route', async () => {
    renderWithProviders(<App />, { initialEntries: ['/admin'] });

    expect(
      await screen.findByRole('heading', { name: 'Acesso administrativo' }),
    ).toBeInTheDocument();
  });

  it('restores a valid stored session before showing the requested admin route', async () => {
    mockApi.use(
      http.get('*/api/admin/me', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer mock-admin-token');
        return HttpResponse.json({ id: 'admin-1', username: 'admin' });
      }),
    );
    sessionStorage.setItem(ADMIN_TOKEN_KEY, 'mock-admin-token');
    renderWithProviders(<App createSocketClient={() => createFakeSocket()} />, {
      initialEntries: ['/admin/eleicoes/election-1/configurar'],
    });

    expect(
      await screen.findByRole('heading', { name: 'Configuração da eleição' }),
    ).toBeInTheDocument();
  });

  it.each([
    { token: 'expired-token', code: 'INVALID_TOKEN' },
    { token: 'mock-voter-token', code: 'FORBIDDEN' },
  ])('rejects a stored token that cannot access admin routes: $code', async ({ token, code }) => {
    mockApi.use(
      http.get('*/api/admin/me', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`);
        return HttpResponse.json(
          { error: { code, message: 'Not an administrator session' } },
          { status: code === 'FORBIDDEN' ? 403 : 401 },
        );
      }),
    );
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    renderWithProviders(<App />, { initialEntries: ['/admin/elections'] });

    expect(
      await screen.findByRole('heading', { name: 'Acesso administrativo' }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });

  it('logs out and clears the administrator session', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/admin/login'] });

    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('heading', { name: 'Painel administrativo' });
    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    expect({
      loginPage: await screen.findByRole('heading', { name: 'Acesso administrativo' }),
      storedToken: sessionStorage.getItem(ADMIN_TOKEN_KEY),
    }).toEqual({ loginPage: expect.any(HTMLElement), storedToken: null });
  });
});
