import { expect, test } from '../fixtures/index.js';
import type { APIRequestContext, Page } from '@playwright/test';

const ROUND_DURATION_SECONDS = 3600;
const INVALID_VOTER_CODE = 'ABCDEFGH';
const NOTHING_TO_UNDO_MESSAGE = 'Não há nenhuma ação para desfazer.';

interface ReadyElectionSetup {
  readonly electionId: string;
  readonly positionId: string;
  readonly candidateId: string;
  readonly codes: readonly string[];
}

/**
 * Completes the fixture election through the real API so the UI can exercise result recovery.
 *
 * @param request - Playwright API client connected to the local application.
 * @param token - Authenticated administrator token.
 * @param election - Ready election and voter credentials supplied by the fixture.
 * @returns Resolves after every voter has cast a vote and the server has closed the round.
 * @throws {Error} When setup responses do not contain the round or voter session identifiers.
 */
async function completeElectionByApi(
  request: APIRequestContext,
  token: string,
  election: ReadyElectionSetup,
): Promise<void> {
  const authorization = { authorization: `Bearer ${token}` };
  const roundResponse = await request.post(`/api/elections/${election.electionId}/rounds`, {
    headers: authorization,
    data: {
      positionId: election.positionId,
      durationSeconds: ROUND_DURATION_SECONDS,
    },
  });
  expect(roundResponse.status()).toBe(201);
  const roundPayload = (await roundResponse.json()) as {
    readonly currentRound?: { readonly roundId?: unknown };
  };
  const roundId = roundPayload.currentRound?.roundId;
  if (typeof roundId !== 'string') {
    throw new Error('Open round did not return a round identifier.');
  }

  const voterTokens = await Promise.all(
    election.codes.map(async (code) => {
      const sessionResponse = await request.post('/api/voter/session', { data: { code } });
      expect(sessionResponse.status()).toBe(200);
      const session = (await sessionResponse.json()) as { readonly token?: unknown };
      if (typeof session.token !== 'string') {
        throw new Error('Create voter session did not return a token.');
      }
      return session.token;
    }),
  );
  await Promise.all(
    voterTokens.map(async (voterToken) => {
      const voteResponse = await request.post('/api/voter/votes', {
        headers: { authorization: `Bearer ${voterToken}` },
        data: { roundId, choice: election.candidateId },
      });
      expect(voteResponse.status()).toBe(204);
    }),
  );
}

/**
 * Opens the administrator's live panel for an election.
 *
 * @param page - Authenticated administrator browser page.
 * @param electionId - Election whose live panel should be displayed.
 * @returns Resolves when the live panel heading is visible.
 */
async function openLivePanel(page: Page, electionId: string): Promise<void> {
  await page.goto(`/admin/eleicoes/${electionId}/configurar`);
  await page.getByRole('tab', { name: 'Ao vivo' }).click();
  await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();
}

test('restores an unpublished result when the administrator undoes its release', async ({
  admin,
  adminPage,
  readyElection,
  request,
}) => {
  await completeElectionByApi(request, admin.token, readyElection);
  await openLivePanel(adminPage, readyElection.electionId);
  await expect(
    adminPage.getByRole('heading', { name: 'Resultado da última rodada' }),
  ).toBeVisible();
  await adminPage.getByRole('button', { name: 'Divulgar resultado aos eleitores' }).click();
  await expect(adminPage.getByText('Resultado divulgado aos eleitores.')).toBeVisible();

  await adminPage.getByRole('button', { name: 'Desfazer última ação' }).click();

  await expect(
    adminPage.getByRole('button', { name: 'Divulgar resultado aos eleitores' }),
  ).toBeVisible();
  await expect(adminPage.getByText('Resultado divulgado aos eleitores.')).toHaveCount(0);
});

test('shows an error when the server no longer has an action to undo', async ({
  admin,
  adminPage,
  readyElection,
  request,
}) => {
  await completeElectionByApi(request, admin.token, readyElection);
  await openLivePanel(adminPage, readyElection.electionId);
  await expect(adminPage.getByRole('button', { name: 'Desfazer última ação' })).toBeVisible();
  await adminPage.route(`**/api/elections/${readyElection.electionId}/undo`, async (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'NOTHING_TO_UNDO', message: 'There is nothing to undo.' },
      }),
    }),
  );

  await adminPage.getByRole('button', { name: 'Desfazer última ação' }).click();

  await expect(adminPage.getByRole('alert')).toHaveText(NOTHING_TO_UNDO_MESSAGE);
});

test('shows a clear message when the voter enters an unknown access code', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Código de acesso').fill(INVALID_VOTER_CODE);
  await page.getByRole('button', { name: 'Entrar para votar' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Este código não é válido. Confira os caracteres e tente novamente.',
  );
});
