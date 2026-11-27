import { expect, test } from '@playwright/test';

test('serves the voter entry page through the local development server', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Vote na sua eleição' })).toBeVisible();
});
