import { expect, test } from '../fixtures/index.js';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Inicia uma sessão eleitoral e aguarda a cédula ativa do eleitor.
 *
 * @param page - Página isolada do navegador do eleitor.
 * @param code - Código de acesso emitido pelo servidor para essa sessão.
 * @returns Resolve quando a cédula e suas opções estão visíveis.
 */
async function enterElection(page: Page, code: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Código de acesso').fill(code);
  await page.getByRole('button', { name: 'Entrar para votar' }).click();

  await expect(page.getByRole('heading', { name: 'President' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Votar em Alex Candidate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Votar em branco' })).toBeVisible();
}

test('three isolated voters can submit candidate and blank votes once', async ({
  admin,
  adminPage,
  browser,
  readyElection,
  request,
}) => {
  const openRoundResponse = await request.post(
    `/api/elections/${readyElection.electionId}/rounds`,
    {
      headers: { authorization: `Bearer ${admin.token}` },
      data: { positionId: readyElection.positionId, durationSeconds: 3600 },
    },
  );
  expect(openRoundResponse.status()).toBe(201);

  const baseURL = new URL(adminPage.url()).origin;
  const firstContext: BrowserContext = await browser.newContext({ baseURL });
  const secondContext: BrowserContext = await browser.newContext({ baseURL });
  const thirdContext: BrowserContext = await browser.newContext({ baseURL });

  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const thirdPage = await thirdContext.newPage();

    await Promise.all([
      enterElection(firstPage, readyElection.codes[0]),
      enterElection(secondPage, readyElection.codes[1]),
      enterElection(thirdPage, readyElection.codes[2]),
    ]);

    const candidateVoteResponse = firstPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
    );
    await firstPage.getByRole('button', { name: 'Votar em Alex Candidate' }).click();
    expect((await candidateVoteResponse).status()).toBe(204);
    await expect(firstPage.getByText('Voto registrado')).toBeVisible();

    const blankVoteResponse = secondPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
    );
    await secondPage.getByRole('button', { name: 'Votar em branco' }).click();
    expect((await blankVoteResponse).status()).toBe(204);
    await expect(secondPage.getByText('Voto registrado')).toBeVisible();

    const finalVoteResponse = thirdPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
    );
    await thirdPage.getByRole('button', { name: 'Votar em Alex Candidate' }).click();
    expect((await finalVoteResponse).status()).toBe(204);
  } finally {
    await Promise.all([firstContext.close(), secondContext.close(), thirdContext.close()]);
  }
});
