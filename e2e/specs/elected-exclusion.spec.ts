import { expect, test } from '../fixtures/index.js';
import type { APIRequestContext, Page } from '@playwright/test';

const ROUND_DURATION_SECONDS = 3600;
const VOTER_COUNT = 3;

interface ElectionState {
  readonly election: {
    readonly positions: readonly {
      readonly id: string;
      readonly title: string;
      readonly status: string;
    }[];
    readonly candidates: readonly { readonly id: string; readonly name: string }[];
  };
  readonly next: {
    readonly status: string;
    readonly positionId?: string;
  };
  readonly currentRound?: {
    readonly roundId: string;
  };
}

interface AdminRequest {
  readonly request: APIRequestContext;
  readonly token: string;
  readonly electionId: string;
  readonly path: string;
  readonly body?: object;
  readonly expectedStatus?: number;
}

interface CandidateInput {
  readonly request: APIRequestContext;
  readonly token: string;
  readonly electionId: string;
  readonly name: string;
  readonly applications: readonly string[];
  readonly firstChoicePositionId: string;
  readonly age?: number;
}

interface PositionIds {
  readonly mayor: string;
  readonly treasurer: string;
  readonly secretary: string;
}

/**
 * Cria uma eleição com duas candidaturas aptas ao cargo seguinte antes da eleição de Ana.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param electionId - Eleição em rascunho fornecida pela fixture.
 * @param token - Token do administrador autenticado.
 * @returns IDs dos cargos e códigos dos eleitores, com a primeira rodada aberta.
 */
async function prepareExclusionElection(
  request: APIRequestContext,
  electionId: string,
  token: string,
): Promise<{ readonly codes: readonly string[] }> {
  const mayorId = await createPosition(request, token, electionId, 'Mayor');
  const treasurerId = await createPosition(request, token, electionId, 'Treasurer');
  const secretaryId = await createPosition(request, token, electionId, 'Secretary');
  await createCandidate({
    request,
    token,
    electionId,
    name: 'Ana',
    applications: [mayorId, treasurerId],
    firstChoicePositionId: mayorId,
    age: 40,
  });
  await createCandidate({
    request,
    token,
    electionId,
    name: 'Bia',
    applications: [mayorId, treasurerId],
    firstChoicePositionId: mayorId,
  });
  await createCandidate({
    request,
    token,
    electionId,
    name: 'Caio',
    applications: [treasurerId, secretaryId],
    firstChoicePositionId: secretaryId,
  });
  const codes = await createVoterCodes(request, token, electionId);
  await openElectionAndRound(request, token, electionId, mayorId);
  return { codes };
}

/**
 * Prepara Treasurer sem candidaturas aptas e Secretary como próximo cargo viável.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param electionId - Eleição em rascunho fornecida pela fixture.
 * @param token - Token do administrador autenticado.
 * @returns Cargo insuficiente depois de Ana ser eleita para Mayor.
 */
async function prepareInsufficientPosition(
  request: APIRequestContext,
  electionId: string,
  token: string,
): Promise<{ readonly treasurerId: string }> {
  const positions = await createThreePositions(request, token, electionId);
  const anaId = await createCandidate({
    request,
    token,
    electionId,
    name: 'Ana',
    applications: [positions.mayor, positions.treasurer],
    firstChoicePositionId: positions.mayor,
    age: 40,
  });
  const biaId = await createCandidate({
    request,
    token,
    electionId,
    name: 'Bia',
    applications: [positions.mayor],
    firstChoicePositionId: positions.mayor,
  });
  await createCandidate({
    request,
    token,
    electionId,
    name: 'Caio',
    applications: [positions.secretary],
    firstChoicePositionId: positions.secretary,
  });
  const codes = await createVoterCodes(request, token, electionId);
  const roundId = await openElectionAndRound(request, token, electionId, positions.mayor);
  const voterTokens = await createVoterSessions(request, codes);
  const [firstVoter, secondVoter, thirdVoter] = voterTokens;
  if (firstVoter === undefined || secondVoter === undefined || thirdVoter === undefined) {
    throw new Error('The election setup did not return all voter sessions.');
  }
  await castVote(request, firstVoter, roundId, anaId);
  await castVote(request, secondVoter, roundId, anaId);
  await castVote(request, thirdVoter, roundId, biaId);
  return { treasurerId: positions.treasurer };
}

/**
 * Cria os três cargos necessários aos cenários de cargo sem pessoas aptas.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param token - Token do administrador autenticado.
 * @param electionId - Eleição que receberá os cargos.
 * @returns IDs dos cargos na ordem configurada.
 */
async function createThreePositions(
  request: APIRequestContext,
  token: string,
  electionId: string,
): Promise<PositionIds> {
  return {
    mayor: await createPosition(request, token, electionId, 'Mayor'),
    treasurer: await createPosition(request, token, electionId, 'Treasurer'),
    secretary: await createPosition(request, token, electionId, 'Secretary'),
  };
}

/**
 * Cria um cargo e lê seu identificador no agregado retornado pela API.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param token - Token do administrador autenticado.
 * @param electionId - Eleição que receberá o cargo.
 * @param title - Título do cargo usado no cenário.
 * @returns Identificador do cargo criado.
 */
async function createPosition(
  request: APIRequestContext,
  token: string,
  electionId: string,
  title: string,
): Promise<string> {
  const state = await postAdminElection({
    request,
    token,
    electionId,
    path: '/positions',
    body: { title, tiebreak: 'OLDEST' },
  });
  const position = state.election.positions.find((entry) => entry.title === title);
  if (position === undefined) {
    throw new Error(`Create position did not return ${title}.`);
  }
  return position.id;
}

/**
 * Cria candidatura com aplicações explícitas e lê o ID devolvido pelo servidor.
 *
 * @param input - Eleição, cargo(s), nome e dados da candidatura.
 * @returns Identificador da candidatura criada.
 */
async function createCandidate(input: CandidateInput): Promise<string> {
  const { request, token, electionId, name, applications, firstChoicePositionId, age = 30 } = input;
  const state = await postAdminElection({
    request,
    token,
    electionId,
    path: '/candidates',
    body: { name, age, remainingMonths: 12, applications, firstChoicePositionId },
  });
  const candidate = state.election.candidates.find((entry) => entry.name === name);
  if (candidate === undefined) {
    throw new Error(`Create candidate did not return ${name}.`);
  }
  return candidate.id;
}

/**
 * Cria os códigos de eleitor que participam da primeira rodada.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param token - Token do administrador autenticado.
 * @param electionId - Eleição que receberá os códigos.
 * @returns Códigos gerados pela API para uso no navegador.
 */
async function createVoterCodes(
  request: APIRequestContext,
  token: string,
  electionId: string,
): Promise<readonly string[]> {
  const response = await request.post(`/api/elections/${electionId}/voters`, {
    headers: authorizationHeaders(token),
    data: { count: VOTER_COUNT },
  });
  await expect(response.status()).toBe(201);
  const payload = (await response.json()) as { readonly codes?: unknown };
  if (
    !Array.isArray(payload.codes) ||
    payload.codes.length !== VOTER_COUNT ||
    payload.codes.some((code: unknown) => typeof code !== 'string')
  ) {
    throw new Error('Create voter credentials did not return valid codes.');
  }
  return payload.codes.filter(isString);
}

/**
 * Abre a eleição e a primeira rodada do cargo indicado.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param token - Token do administrador autenticado.
 * @param electionId - Eleição que será aberta.
 * @param positionId - Cargo da primeira rodada.
 * @returns Identificador da rodada aberta.
 */
async function openElectionAndRound(
  request: APIRequestContext,
  token: string,
  electionId: string,
  positionId: string,
): Promise<string> {
  const openResponse = await request.post(`/api/elections/${electionId}/open`, {
    headers: authorizationHeaders(token),
  });
  await expect(openResponse.status()).toBe(200);
  const roundState = await postAdminElection({
    request,
    token,
    electionId,
    path: '/rounds',
    body: { positionId, durationSeconds: ROUND_DURATION_SECONDS },
  });
  const roundId = roundState.currentRound?.roundId;
  if (roundId === undefined) {
    throw new Error('Open round did not return a round identifier.');
  }
  return roundId;
}

/**
 * Cria sessões para credenciais e envia escolhas na ordem fornecida.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param codes - Códigos gerados para os eleitores da rodada.
 * @returns Tokens de sessão na mesma ordem dos códigos.
 */
async function createVoterSessions(
  request: APIRequestContext,
  codes: readonly string[],
): Promise<readonly string[]> {
  const sessions = await Promise.all(
    codes.map(async (code) => {
      const response = await request.post('/api/voter/session', { data: { code } });
      await expect(response.status()).toBe(200);
      const payload = (await response.json()) as { readonly token?: unknown };
      if (typeof payload.token !== 'string' || payload.token.length === 0) {
        throw new Error('Create voter session did not return a valid token.');
      }
      return payload.token;
    }),
  );
  return sessions;
}

/**
 * Registra um voto de eleitor na rodada aberta.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param voterToken - Token de sessão do eleitor.
 * @param roundId - Rodada aberta pelo administrador.
 * @param choice - ID da candidatura escolhida.
 * @returns Resolve quando o voto é aceito pelo servidor.
 */
async function castVote(
  request: APIRequestContext,
  voterToken: string,
  roundId: string,
  choice: string,
): Promise<void> {
  const response = await request.post('/api/voter/votes', {
    headers: authorizationHeaders(voterToken),
    data: { roundId, choice },
  });
  await expect(response.status()).toBe(204);
}

/**
 * Registra uma escolha pela cédula visível no navegador.
 *
 * @param page - Página isolada do eleitor.
 * @param candidateName - Nome da candidatura escolhida.
 * @returns Resolve quando o servidor aceita o voto.
 */
async function castBallot(page: Page, candidateName: string): Promise<void> {
  const voteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/voter/votes') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: `Votar em ${candidateName}` }).click();
  await expect((await voteResponse).status()).toBe(204);
}

/**
 * Entra na eleição e aguarda a cédula do cargo atual.
 *
 * @param page - Página isolada do eleitor.
 * @param code - Código de acesso criado para o cenário.
 * @param positionTitle - Cargo cuja votação está aberta.
 * @returns Resolve quando a página apresenta o cargo.
 */
async function enterBallot(page: Page, code: string, positionTitle: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Código de acesso').fill(code);
  await page.getByRole('button', { name: 'Entrar para votar' }).click();
  await expect(page.getByRole('heading', { name: positionTitle })).toBeVisible();
}

/**
 * Envia uma mutação administrativa e valida a resposta do agregado.
 *
 * @param input - Rota, credencial, corpo e status HTTP esperado.
 * @returns Snapshot atualizado da eleição.
 */
async function postAdminElection({
  request,
  token,
  electionId,
  path,
  body,
  expectedStatus = 201,
}: AdminRequest): Promise<ElectionState> {
  const response = await request.post(`/api/elections/${electionId}${path}`, {
    headers: authorizationHeaders(token),
    ...(body === undefined ? {} : { data: body }),
  });
  await expect(response.status()).toBe(expectedStatus);
  return (await response.json()) as ElectionState;
}

/**
 * Cria um cabeçalho Bearer para as rotas administrativas e eleitorais.
 *
 * @param token - Token emitido pelo servidor.
 * @returns Cabeçalho HTTP de autorização.
 */
function authorizationHeaders(token: string): { readonly authorization: string } {
  return { authorization: `Bearer ${token}` };
}

/**
 * Valida valores textuais recebidos em uma lista da API.
 *
 * @param value - Valor desconhecido devolvido pelo servidor.
 * @returns Se o valor é texto.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

test('excludes the elected candidate from the next ballot and keeps eligible candidates', async ({
  admin,
  adminPage,
  browser,
  election,
  request,
}) => {
  const scenario = await prepareExclusionElection(request, election.id, admin.token);
  const baseURL = new URL(adminPage.url()).origin;
  const contexts = await Promise.all(scenario.codes.map(() => browser.newContext({ baseURL })));

  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const [firstPage, secondPage, thirdPage] = pages;
    if (firstPage === undefined || secondPage === undefined || thirdPage === undefined) {
      throw new Error('The browser setup did not return all voter pages.');
    }
    await Promise.all(
      pages.map((page, index) => {
        const code = scenario.codes[index];
        if (code === undefined) {
          throw new Error(`Missing voter code at index ${index}.`);
        }
        return enterBallot(page, code, 'Mayor');
      }),
    );

    await adminPage.goto(`/admin/eleicoes/${election.id}/configurar`);
    await adminPage.getByRole('tab', { name: 'Ao vivo' }).click();
    await castBallot(firstPage, 'Ana');
    await castBallot(secondPage, 'Ana');
    await castBallot(thirdPage, 'Bia');
    await expect(
      adminPage.getByRole('heading', { name: 'Resultado da última rodada' }),
    ).toBeVisible();
    await expect(adminPage.getByText('Pessoa eleita: Ana.')).toBeVisible();

    await adminPage.getByRole('button', { name: 'Abrir rodada' }).click();
    await Promise.all([
      expect(firstPage.getByRole('heading', { name: 'Treasurer' })).toBeVisible(),
      expect(firstPage.getByRole('button', { name: 'Votar em Bia' })).toBeVisible(),
      expect(firstPage.getByRole('button', { name: 'Votar em Caio' })).toBeVisible(),
    ]);
    await expect(firstPage.getByRole('button', { name: 'Votar em Ana' })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('attaches an existing candidate to a position from the live panel', async ({
  admin,
  adminPage,
  election,
  request,
}) => {
  await prepareInsufficientPosition(request, election.id, admin.token);
  await openLivePanel(adminPage, election.id);

  await expect(
    adminPage.getByRole('heading', { name: 'Pessoas candidatas insuficientes para: Treasurer' }),
  ).toBeVisible();
  await adminPage.getByRole('button', { name: 'Vincular Bia' }).click();

  await expect(adminPage.getByText('Pronto para iniciar: Treasurer')).toBeVisible();
});

test('defers a position without eligible candidates from the live panel', async ({
  admin,
  adminPage,
  election,
  request,
}) => {
  await prepareInsufficientPosition(request, election.id, admin.token);
  await openLivePanel(adminPage, election.id);

  await adminPage.getByRole('button', { name: 'Adiar Treasurer' }).click();

  await expect(adminPage.getByText('Pronto para iniciar: Secretary')).toBeVisible();
});

test('cancels a position only after confirming twice and typing its exact title', async ({
  admin,
  adminPage,
  election,
  request,
}) => {
  const scenario = await prepareInsufficientPosition(request, election.id, admin.token);
  await openLivePanel(adminPage, election.id);
  await adminPage.getByRole('button', { name: 'Cancelar Treasurer' }).click();

  const firstDialog = adminPage.getByRole('dialog', { name: 'Cancelar cargo?' });
  await expect(firstDialog).toBeVisible();
  await firstDialog.getByRole('button', { name: 'Continuar' }).click();

  const finalDialog = adminPage.getByRole('dialog', { name: 'Confirmar cancelamento' });
  const confirmationInput = finalDialog.getByRole('textbox', {
    name: 'Digite o nome do cargo para confirmar',
  });
  const confirmButton = finalDialog.getByRole('button', { name: 'Cancelar cargo' });
  await expect(confirmButton).toBeDisabled();
  await confirmationInput.fill('Treasurer?');
  await expect(confirmButton).toBeDisabled();
  await confirmationInput.fill('Treasurer');
  await confirmButton.click();

  await expect(adminPage.getByText('Pronto para iniciar: Secretary')).toBeVisible();
  const state = await readElectionState(request, admin.token, election.id);
  await expect(state.election.positions.find(({ id }) => id === scenario.treasurerId)?.status).toBe(
    'CANCELLED',
  );
});

/**
 * Navega para a aba ao vivo de uma eleição já preparada.
 *
 * @param page - Página autenticada do administrador.
 * @param electionId - Eleição cujo painel será aberto.
 * @returns Resolve quando a aba de controle fica visível.
 */
async function openLivePanel(page: Page, electionId: string): Promise<void> {
  await page.goto(`/admin/eleicoes/${electionId}/configurar`);
  await page.getByRole('tab', { name: 'Ao vivo' }).click();
}

/**
 * Lê o agregado atual da eleição para conferir o estado persistido pelo servidor.
 *
 * @param request - Cliente HTTP conectado ao servidor local.
 * @param token - Token do administrador autenticado.
 * @param electionId - Eleição a consultar.
 * @returns Snapshot administrativo atual.
 */
async function readElectionState(
  request: APIRequestContext,
  token: string,
  electionId: string,
): Promise<ElectionState> {
  const response = await request.get(`/api/elections/${electionId}`, {
    headers: authorizationHeaders(token),
  });
  await expect(response.status()).toBe(200);
  return (await response.json()) as ElectionState;
}
