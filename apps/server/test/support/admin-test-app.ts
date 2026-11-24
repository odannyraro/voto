import type { AdminElectionDTO } from '@voto/shared';
import { onTestFinished } from 'vitest';
import type { AppDeps } from '../../src/app';
import { makeTestApp, type TestApp } from './make-test-app';

/** Id da admin Ana, dona das eleições nos testes de rotas. */
export const ANA = 'admin-ana';
/** Id da admin Bia, usada como "outro admin" nos testes de autorização. */
export const BIA = 'admin-bia';

/**
 * Cabeçalho `authorization` de uma requisição autenticada. É `type` (não `interface`) para
 * ser aceito onde o `inject` espera um mapa de cabeçalhos.
 */
export type AuthHeaders = Readonly<Record<'authorization', string>>;

/** App de teste com os cabeçalhos de autorização das duas admins. */
export interface TwoAdminsTestApp extends TestApp {
  readonly asAna: AuthHeaders;
  readonly asBia: AuthHeaders;
}

/**
 * Monta o app de teste e emite um token de admin para a Ana e outro para a Bia. O app é
 * fechado ao fim do teste que o criou (`onTestFinished`), então só pode ser chamado de
 * dentro de um teste.
 *
 * @param overrides - Dependências a trocar (ex.: um gerador de códigos com valores fixos).
 * @returns O app de teste e os cabeçalhos `authorization` da Ana e da Bia.
 */
export async function appWithTwoAdmins(
  overrides: Partial<AppDeps> = {},
): Promise<TwoAdminsTestApp> {
  const test = makeTestApp(overrides);
  onTestFinished(async () => {
    await test.app.close();
  });
  return {
    ...test,
    asAna: await bearer(test, ANA),
    asBia: await bearer(test, BIA),
  };
}

/**
 * Passo pela API: a Ana abre a rodada de um cargo, como faria no painel (o que também agenda
 * o fechamento automático).
 *
 * @param test - App de teste em que a Ana é dona da eleição, já aberta e sem rodada em curso.
 * @param round - Eleição e cargo a votar.
 * @returns O id da rodada aberta (vazio se a API recusou a abertura).
 */
export async function openRoundViaApi(
  test: TwoAdminsTestApp,
  round: { readonly electionId: string; readonly positionId: string },
): Promise<string> {
  const response = await test.app.inject({
    method: 'POST',
    url: `/api/elections/${round.electionId}/rounds`,
    headers: test.asAna,
    payload: { positionId: round.positionId },
  });
  return response.json<AdminElectionDTO>().currentRound?.roundId ?? '';
}

/**
 * Passo pela API: o eleitor entra com o código e recebe o token da sessão.
 *
 * @param test - App de teste em que a eleição do código já está guardada.
 * @param code - Código de acesso do eleitor.
 * @returns O cabeçalho `authorization` do eleitor.
 */
export async function voterSessionHeaders(test: TestApp, code: string): Promise<AuthHeaders> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/voter/session',
    payload: { code },
  });
  return { authorization: `Bearer ${response.json<{ token: string }>().token}` };
}

/**
 * Monta o cabeçalho de autorização de um admin com um token emitido pelo app de teste.
 *
 * @param test - App de teste cujo serviço de auth emite o token.
 * @param adminId - Admin dono do token.
 * @returns O cabeçalho `authorization` com o token `Bearer`.
 */
async function bearer(test: TestApp, adminId: string): Promise<AuthHeaders> {
  return { authorization: `Bearer ${await test.auth.issueAdminToken(adminId)}` };
}
