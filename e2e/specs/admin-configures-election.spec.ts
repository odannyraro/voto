import { expect, test } from '../fixtures/index.js';
import type { Page } from '@playwright/test';

/**
 * Autentica o administrador pela tela pública de login.
 *
 * @param page - Página isolada do teste.
 * @returns Resolve quando o painel administrativo é exibido.
 */
async function loginThroughUi(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Usuário' }).fill('e2e-admin');
  await page.getByLabel('Senha').fill('e2e-password');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Painel administrativo' })).toBeVisible();
}

/**
 * Cria uma eleição pela interface e aguarda sua tela de configuração.
 *
 * @param page - Página autenticada do administrador.
 * @param name - Nome explícito que identifica a eleição no cenário.
 * @returns Resolve quando a configuração da eleição é carregada.
 */
async function createElectionThroughUi(page: Page, name: string): Promise<void> {
  await page.getByLabel('Nome da eleição').fill(name);
  await page.getByRole('button', { name: 'Criar eleição' }).click();

  await expect(page.getByRole('heading', { name: 'Configuração da eleição' })).toBeVisible();
  await expect(page.getByText(`Eleição: ${name}`)).toBeVisible();
}

/**
 * Cadastra um cargo na eleição em preparação.
 *
 * @param page - Página de configuração da eleição.
 * @param title - Título do cargo que será usado na cédula.
 * @returns Resolve quando o cargo aparece na configuração.
 */
async function addPositionThroughUi(page: Page, title: string): Promise<void> {
  await page.getByLabel('Nome do cargo').fill(title);
  await page.getByRole('button', { name: 'Adicionar cargo' }).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/**
 * Cadastra uma candidatura para o cargo selecionado.
 *
 * @param page - Página de configuração da eleição.
 * @param positionTitle - Cargo ao qual a pessoa candidata se inscreve.
 * @returns Resolve quando a candidatura aparece na lista.
 */
async function addCandidateThroughUi(page: Page, positionTitle: string): Promise<void> {
  await page.getByRole('tab', { name: 'Candidaturas' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Ana Costa');
  await page.getByLabel('Idade (anos)').fill('22');
  await page.getByLabel('Tempo restante na universidade (meses)').fill('18');
  await page.getByRole('checkbox', { name: positionTitle }).check();
  await page.getByLabel('Primeira opção de cargo').selectOption({ label: positionTitle });
  await page.getByRole('button', { name: 'Adicionar candidatura' }).click();

  await expect(page.getByRole('heading', { name: 'Ana Costa' })).toBeVisible();
}

/**
 * Gera códigos eleitorais pela interface administrativa.
 *
 * @param page - Página de configuração da eleição.
 * @param count - Quantidade de credenciais que o cenário requer.
 * @returns Resolve quando a interface confirma a geração.
 */
async function generateVoterCodesThroughUi(page: Page, count: number): Promise<void> {
  await page.getByRole('tab', { name: 'Eleitores' }).click();
  await page.getByLabel('Quantidade de eleitores').fill(String(count));
  await page.getByRole('button', { name: 'Gerar códigos' }).click();

  await expect(page.getByRole('table', { name: 'Códigos de acesso dos eleitores' })).toBeVisible();
}

test('configures and opens an election through the administrator interface', async ({ page }) => {
  await loginThroughUi(page);
  await createElectionThroughUi(page, 'Assembleia estudantil');
  await addPositionThroughUi(page, 'Presidência');
  await addCandidateThroughUi(page, 'Presidência');
  await generateVoterCodesThroughUi(page, 3);

  await page.getByRole('button', { name: 'Abrir eleição' }).click();

  await expect(page.getByText('Situação: Aberta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir eleição' })).toHaveCount(0);
});

test('keeps an election in draft when opening is attempted without positions', async ({ page }) => {
  await loginThroughUi(page);
  await createElectionThroughUi(page, 'Eleição sem cargos');

  await page.getByRole('button', { name: 'Abrir eleição' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Adicione ao menos um cargo antes de abrir a eleição.',
  );
  await expect(page.getByText('Situação: Em preparação')).toBeVisible();
});

test('keeps a position without candidates from starting a voting round', async ({ page }) => {
  await loginThroughUi(page);
  await createElectionThroughUi(page, 'Eleição sem candidatura');
  await addPositionThroughUi(page, 'Tesouraria');
  await generateVoterCodesThroughUi(page, 1);

  await page.getByRole('button', { name: 'Abrir eleição' }).click();
  await expect(page.getByText('Situação: Aberta')).toBeVisible();
  await page.getByRole('tab', { name: 'Ao vivo' }).click();

  await expect(
    page.getByRole('heading', { name: 'Pessoas candidatas insuficientes para: Tesouraria' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir rodada' })).toHaveCount(0);
});
