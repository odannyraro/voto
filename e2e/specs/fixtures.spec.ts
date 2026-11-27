import { expect, test } from '../fixtures/index.js';

test('authenticates the administrator fixture with the real API', async ({ admin }) => {
  expect(admin.identity.username).toBe('e2e-admin');
});

test('creates an open election with a position, candidate, and voter codes', async ({
  readyElection,
}) => {
  expect(readyElection.codes).toHaveLength(3);
  expect(readyElection.status).toBe('OPEN');
  expect(readyElection.electionId).not.toBe('');
  expect(readyElection.positionId).not.toBe('');
  expect(readyElection.candidateId).not.toBe('');
});

test('starts a new browser context without inheriting the administrator session', async ({
  adminPage,
  cleanContext,
}) => {
  await expect(adminPage.getByRole('heading', { name: 'Painel administrativo' })).toBeVisible();

  const cleanPage = await cleanContext.newPage();
  await cleanPage.goto('/admin');

  await expect(cleanPage).toHaveURL(/\/admin\/login$/);
  expect(
    await cleanPage.evaluate(() => window.sessionStorage.getItem('voto:admin-token')),
  ).toBeNull();
});
