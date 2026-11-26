import { loginBodySchema } from '@voto/shared';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useNavigate, Navigate } from 'react-router';
import { ApiError } from '../../../api/api-client';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { useAdminAuth } from './admin-auth-context';

/**
 * Apresenta o formulário de acesso administrativo e valida a identidade no servidor.
 *
 * @returns Formulário de login ou redirecionamento para o painel autenticado.
 */
export function AdminLoginPage(): ReactElement {
  const { status, errorMessage, login } = useAdminAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError>();
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Autentica as credenciais e navega ao painel após validar `/admin/me`.
   *
   * @param event - Envio do formulário de login.
   * @returns Resolve depois de atualizar o estado do formulário e a rota.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    const parsedBody = loginBodySchema.safeParse({ username, password });
    if (!parsedBody.success) {
      setMessage('Enter a username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(parsedBody.data);
      navigate('/admin', { replace: true });
    } catch (loginError: unknown) {
      if (loginError instanceof ApiError && loginError.error !== undefined) {
        setError(loginError);
      } else {
        setMessage('Unable to sign in. Check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === 'authenticated') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <main>
      <h1>Administrator login</h1>
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="admin-username">Username</label>
        <input
          id="admin-username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
        />
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        {errorMessage !== null && <p role="alert">{errorMessage}</p>}
        {error?.error !== undefined && <ErrorMessage error={{ error: error.error }} />}
        {message !== undefined && <p role="alert">{message}</p>}
        <button type="submit" disabled={isSubmitting || status === 'loading'}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
