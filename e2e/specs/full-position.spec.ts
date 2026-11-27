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

test('closes the round after every vote and releases its result only to voters afterward', async ({
  adminPage,
  browser,
  readyElection,
}) => {
  const baseURL = new URL(adminPage.url()).origin;
  const voterContexts = await Promise.all([
    browser.newContext({ baseURL }),
    browser.newContext({ baseURL }),
    browser.newContext({ baseURL }),
  ]);

  try {
    const [firstPage, secondPage, thirdPage] = await Promise.all(
      voterContexts.map((context) => context.newPage()),
    );

    await adminPage.goto(`/admin/eleicoes/${readyElection.electionId}/configurar`);
    await adminPage.getByRole('tab', { name: 'Ao vivo' }).click();
    await adminPage.getByRole('spinbutton', { name: 'Duração da rodada (segundos)' }).fill('3600');
    await adminPage.getByRole('button', { name: 'Abrir rodada' }).click();
    await expect(adminPage.getByText('Votação em andamento: President')).toBeVisible();

    await Promise.all([
      enterElection(firstPage, readyElection.codes[0]),
      enterElection(secondPage, readyElection.codes[1]),
      enterElection(thirdPage, readyElection.codes[2]),
    ]);

    const firstVoteResponse = firstPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
    );
    await firstPage.getByRole('button', { name: 'Votar em Alex Candidate' }).click();
    expect((await firstVoteResponse).status()).toBe(204);

    const secondVoteResponse = secondPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
    );
    await secondPage.getByRole('button', { name: 'Votar em branco' }).click();
    expect((await secondVoteResponse).status()).toBe(204);
    await expect(adminPage.getByText('Votos: 2 de 3')).toBeVisible();

    const finalVoteResponse = thirdPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
    );
    await thirdPage.getByRole('button', { name: 'Votar em Alex Candidate' }).click();
    expect((await finalVoteResponse).status()).toBe(204);

    await expect(
      adminPage.getByRole('heading', { name: 'Resultado da última rodada' }),
    ).toBeVisible();
    await expect(adminPage.getByText('Pessoa eleita: Alex Candidate.')).toBeVisible();
    await expect(adminPage.getByText('Alex Candidate: 2 votos')).toBeVisible();
    await expect(adminPage.getByText('Votos válidos: 2; votos em branco: 1.')).toBeVisible();
    await expect(
      adminPage.getByRole('button', { name: 'Divulgar resultado aos eleitores' }),
    ).toBeVisible();

    const privateResultCounts = await Promise.all([
      firstPage.getByRole('heading', { name: 'Resultado: President' }).count(),
      firstPage.getByText('Alex Candidate: 2 votos').count(),
      secondPage.getByRole('heading', { name: 'Resultado: President' }).count(),
      secondPage.getByText('Alex Candidate: 2 votos').count(),
      thirdPage.getByRole('heading', { name: 'Resultado: President' }).count(),
      thirdPage.getByText('Alex Candidate: 2 votos').count(),
    ]);
    expect(privateResultCounts).toEqual([0, 0, 0, 0, 0, 0]);

    await adminPage.getByRole('button', { name: 'Divulgar resultado aos eleitores' }).click();
    await expect(adminPage.getByText('Resultado divulgado aos eleitores.')).toBeVisible();

    await Promise.all([
      expect(firstPage.getByRole('heading', { name: 'Resultado: President' })).toBeVisible(),
      expect(firstPage.getByText('Pessoa eleita: Alex Candidate')).toBeVisible(),
      expect(firstPage.getByText('Alex Candidate: 2 votos')).toBeVisible(),
      expect(firstPage.getByText('Votos válidos: 2')).toBeVisible(),
      expect(firstPage.getByText('Votos em branco: 1')).toBeVisible(),
      expect(secondPage.getByRole('heading', { name: 'Resultado: President' })).toBeVisible(),
      expect(secondPage.getByText('Pessoa eleita: Alex Candidate')).toBeVisible(),
      expect(secondPage.getByText('Alex Candidate: 2 votos')).toBeVisible(),
      expect(secondPage.getByText('Votos válidos: 2')).toBeVisible(),
      expect(secondPage.getByText('Votos em branco: 1')).toBeVisible(),
      expect(thirdPage.getByRole('heading', { name: 'Resultado: President' })).toBeVisible(),
      expect(thirdPage.getByText('Pessoa eleita: Alex Candidate')).toBeVisible(),
      expect(thirdPage.getByText('Alex Candidate: 2 votos')).toBeVisible(),
      expect(thirdPage.getByText('Votos válidos: 2')).toBeVisible(),
      expect(thirdPage.getByText('Votos em branco: 1')).toBeVisible(),
    ]);
  } finally {
    await Promise.all(voterContexts.map((context) => context.close()));
  }
});
