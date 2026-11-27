import { expect, test } from '../fixtures/index.js';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

const VOTER_COUNT = 5;
const ROUND_DURATION_SECONDS = 3600;

interface ElectionState {
  readonly election: {
    readonly positions: readonly {
      readonly id: string;
      readonly status: string;
      readonly electedCandidateId?: string;
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
  readonly lastResult?: {
    readonly outcome: string;
    readonly electedCandidateId?: string;
    readonly runoffCandidateIds?: readonly string[];
    readonly counts: readonly {
      readonly candidateId: string;
      readonly name: string;
      readonly votes: number;
    }[];
  };
}

interface ThreeWayRace {
  readonly positionId: string;
  readonly anaId: string;
  readonly biaId: string;
  readonly caioId: string;
}

interface AdminPostInput {
  readonly request: APIRequestContext;
  readonly adminToken: string;
  readonly url: string;
  readonly body?: object;
  readonly expectedStatus?: number;
}

interface CreateCandidateInput {
  readonly request: APIRequestContext;
  readonly adminToken: string;
  readonly electionId: string;
  readonly positionId: string;
  readonly name: string;
}

interface CastVoteInput {
  readonly request: APIRequestContext;
  readonly voterToken: string;
  readonly roundId: string;
  readonly candidateId: string;
}

interface VoterBallot {
  readonly phase: string;
  readonly round?: {
    readonly kind: string;
    readonly candidates: readonly { readonly id: string; readonly name: string }[];
  };
}

/**
 * Cria uma eleição pronta para verificar a preparação de um segundo turno.
 *
 * @param request - Cliente HTTP do Playwright conectado ao backend local.
 * @param electionId - Eleição em rascunho criada pela fixture.
 * @param adminToken - Token do administrador que controla a eleição.
 * @returns IDs do cargo e das três candidaturas criadas.
 */
async function createThreeWayRace(
  request: APIRequestContext,
  electionId: string,
  adminToken: string,
): Promise<ThreeWayRace> {
  const positionState = await postAdminElection({
    request,
    adminToken,
    url: `/api/elections/${electionId}/positions`,
    body: { title: 'Mayor', tiebreak: 'OLDEST' },
  });
  const positionId = readPositionId(positionState);
  const anaId = await createCandidate({
    request,
    adminToken,
    electionId,
    positionId,
    name: 'Ana',
  });
  const biaId = await createCandidate({
    request,
    adminToken,
    electionId,
    positionId,
    name: 'Bia',
  });
  const caioId = await createCandidate({
    request,
    adminToken,
    electionId,
    positionId,
    name: 'Caio',
  });

  return { positionId, anaId, biaId, caioId };
}

/**
 * Cria uma candidatura para concorrer exclusivamente ao cargo da disputa.
 *
 * @param request - Cliente HTTP do Playwright conectado ao backend local.
 * @param adminToken - Token do administrador que controla a eleição.
 * @param electionId - Eleição em rascunho que recebe a candidatura.
 * @param positionId - Cargo para o qual a candidatura será criada.
 * @param name - Nome explícito da pessoa candidata no cenário.
 * @returns ID da candidatura devolvido pelo agregado atualizado.
 */
async function createCandidate(input: CreateCandidateInput): Promise<string> {
  const { request, adminToken, electionId, positionId, name } = input;
  const state = await postAdminElection({
    request,
    adminToken,
    url: `/api/elections/${electionId}/candidates`,
    body: {
      name,
      age: 30,
      remainingMonths: 12,
      applications: [positionId],
      firstChoicePositionId: positionId,
    },
  });
  const candidate = state.election.candidates.find((entry) => entry.name === name);
  if (candidate === undefined) {
    throw new Error(`Create candidate did not return ${name}.`);
  }
  return candidate.id;
}

/**
 * Prepara e apura o primeiro turno com votos divididos entre três candidaturas.
 *
 * @param request - Cliente HTTP do Playwright conectado ao backend local.
 * @param electionId - Eleição em rascunho criada pela fixture.
 * @param adminToken - Token do administrador que controla a eleição.
 * @returns Snapshot administrativo após a apuração e IDs das candidaturas.
 */
async function prepareRunoffScenario(
  request: APIRequestContext,
  electionId: string,
  adminToken: string,
): Promise<{
  readonly state: ElectionState;
  readonly race: ThreeWayRace;
  readonly voterTokens: readonly string[];
}> {
  const race = await createThreeWayRace(request, electionId, adminToken);
  const codes = await createVoterCodes(request, electionId, adminToken);

  await postAdminElection({
    request,
    adminToken,
    url: `/api/elections/${electionId}/open`,
    expectedStatus: 200,
  });
  const voterTokens = await Promise.all(codes.map((code) => createVoterSession(request, code)));
  const roundState = await postAdminElection({
    request,
    adminToken,
    url: `/api/elections/${electionId}/rounds`,
    body: { positionId: race.positionId, durationSeconds: ROUND_DURATION_SECONDS },
  });
  const roundId = roundState.currentRound?.roundId;
  if (roundId === undefined) {
    throw new Error('Open first round did not return a round identifier.');
  }

  await castFirstRoundVotes({ request, voterTokens, roundId, race });

  const response = await request.get(`/api/elections/${electionId}`, {
    headers: authorizationHeaders(adminToken),
  });
  await expectStatus(response, 200, 'Read runoff election');
  return { state: (await response.json()) as ElectionState, race, voterTokens };
}

/**
 * Cria cinco credenciais para permitir o placar explícito de 2–2–1.
 *
 * @param request - Cliente HTTP do Playwright conectado ao backend local.
 * @param electionId - Eleição que receberá as credenciais.
 * @param adminToken - Token do administrador que controla a eleição.
 * @returns Códigos gerados pelo servidor, na ordem devolvida pela API.
 */
async function createVoterCodes(
  request: APIRequestContext,
  electionId: string,
  adminToken: string,
): Promise<readonly string[]> {
  const response = await request.post(`/api/elections/${electionId}/voters`, {
    headers: authorizationHeaders(adminToken),
    data: { count: VOTER_COUNT },
  });
  await expectStatus(response, 201, 'Create voter credentials');
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
 * Troca um código de acesso por um token de sessão eleitoral.
 *
 * @param request - Cliente HTTP do Playwright conectado ao backend local.
 * @param code - Código de acesso gerado para a eleição.
 * @returns Token de autenticação emitido para o eleitor.
 */
async function createVoterSession(request: APIRequestContext, code: string): Promise<string> {
  const response = await request.post('/api/voter/session', { data: { code } });
  await expectStatus(response, 200, 'Create voter session');
  const session = (await response.json()) as { readonly token?: unknown };
  if (typeof session.token !== 'string' || session.token.length === 0) {
    throw new Error('Create voter session did not return a valid token.');
  }
  return session.token;
}

/**
 * Registra uma escolha do eleitor na rodada aberta.
 *
 * @param input - Cliente, credencial, rodada e candidatura escolhida pelo eleitor.
 * @returns Resolve quando o servidor aceita o voto.
 */
async function castVote(input: CastVoteInput): Promise<void> {
  const { request, voterToken, roundId, candidateId } = input;
  const response = await request.post('/api/voter/votes', {
    headers: authorizationHeaders(voterToken),
    data: { roundId, choice: candidateId },
  });
  await expectStatus(response, 204, 'Cast vote');
}

/**
 * Aplica o placar explícito 2–2–1 para que somente Ana e Bia avancem.
 *
 * @param input - Cliente, credenciais, rodada e candidaturas da disputa.
 * @returns Resolve quando os cinco votos são aceitos pelo servidor.
 */
async function castFirstRoundVotes(input: {
  readonly request: APIRequestContext;
  readonly voterTokens: readonly string[];
  readonly roundId: string;
  readonly race: ThreeWayRace;
}): Promise<void> {
  const { request, voterTokens, roundId, race } = input;
  await castVote({ request, voterToken: voterTokens[0], roundId, candidateId: race.anaId });
  await castVote({ request, voterToken: voterTokens[1], roundId, candidateId: race.anaId });
  await castVote({ request, voterToken: voterTokens[2], roundId, candidateId: race.biaId });
  await castVote({ request, voterToken: voterTokens[3], roundId, candidateId: race.biaId });
  await castVote({ request, voterToken: voterTokens[4], roundId, candidateId: race.caioId });
}

/**
 * Envia uma mutação administrativa e valida o status antes de ler o agregado.
 *
 * @param input - Cliente, credencial, rota, corpo e status esperado (201 por padrão).
 * @returns Snapshot completo da eleição devolvido pelo servidor.
 */
async function postAdminElection({
  request,
  adminToken,
  url,
  body,
  expectedStatus = 201,
}: AdminPostInput): Promise<ElectionState> {
  const response = await request.post(url, {
    headers: authorizationHeaders(adminToken),
    ...(body === undefined ? {} : { data: body }),
  });
  await expectStatus(response, expectedStatus, url);
  return (await response.json()) as ElectionState;
}

/**
 * Identifica valores de texto entre os códigos retornados pela API.
 *
 * @param value - Value returned by the API.
 * @returns Indica se o valor é texto.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Lê o ID do cargo criado a partir do agregado da eleição.
 *
 * @param state - Snapshot administrativo devolvido após criar o cargo.
 * @returns Identificador do cargo Mayor.
 */
function readPositionId(state: ElectionState): string {
  const position = state.election.positions.find((entry) => entry.status === 'PENDING');
  if (position === undefined) {
    throw new Error('Create position did not return a pending position.');
  }
  return position.id;
}

/**
 * Monta o cabeçalho Bearer esperado pelas rotas autenticadas da API.
 *
 * @param token - Token administrativo ou eleitoral emitido pelo servidor.
 * @returns Cabeçalho HTTP de autorização.
 */
function authorizationHeaders(token: string): { readonly authorization: string } {
  return { authorization: ['Bearer', token].join(' ') };
}

/**
 * Falha com contexto se uma etapa HTTP de preparação não retornar o status esperado.
 *
 * @param response - Resposta da API real.
 * @param expectedStatus - Status HTTP esperado pela operação.
 * @param operation - Operação de preparação que está sendo validada.
 * @returns Resolve quando o status esperado foi recebido.
 * @throws {Error} Quando a API responde com um status diferente.
 */
async function expectStatus(
  response: APIResponse,
  expectedStatus: number,
  operation: string,
): Promise<void> {
  if (response.status() === expectedStatus) return;
  throw new Error(`${operation} failed with ${response.status()}: ${await response.text()}`);
}

/**
 * Aguarda o painel administrativo refletir a eleição que está sendo preparada.
 *
 * @param page - Página autenticada do administrador.
 * @param electionId - Eleição cujo painel ao vivo será aberto.
 * @returns Resolve quando o painel ao vivo está visível.
 */
async function openLiveElection(page: Page, electionId: string): Promise<void> {
  await page.goto(`/admin/eleicoes/${electionId}/configurar`);
  await page.getByRole('tab', { name: 'Ao vivo' }).click();
  await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();
}

/**
 * Lê a cédula que um eleitor autenticado pode ver no segundo turno.
 *
 * @param request - Cliente HTTP do Playwright conectado ao backend local.
 * @param voterToken - Token da sessão eleitoral.
 * @returns Fase, tipo da rodada e candidaturas disponíveis na cédula.
 */
async function readVoterBallot(
  request: APIRequestContext,
  voterToken: string,
): Promise<VoterBallot> {
  const response = await request.get('/api/voter/state', {
    headers: authorizationHeaders(voterToken),
  });
  await expectStatus(response, 200, 'Read voter ballot');
  return (await response.json()) as VoterBallot;
}

test('prepares a runoff with exactly two finalists after a divided first round', async ({
  admin,
  adminPage,
  election,
  request,
}) => {
  const { state, race } = await prepareRunoffScenario(request, election.id, admin.token);

  expect({
    next: state.next,
    outcome: state.lastResult?.outcome,
    finalists: state.lastResult?.runoffCandidateIds,
    candidateVotes: state.lastResult?.counts.map(({ name, votes }) => ({ name, votes })),
    positionStatus: state.election.positions.find(({ id }) => id === race.positionId)?.status,
  }).toEqual({
    next: { status: 'AWAITING_RUNOFF', positionId: race.positionId },
    outcome: 'RUNOFF_REQUIRED',
    finalists: [race.anaId, race.biaId],
    candidateVotes: [
      { name: 'Ana', votes: 2 },
      { name: 'Bia', votes: 2 },
      { name: 'Caio', votes: 1 },
    ],
    positionStatus: 'AWAITING_RUNOFF',
  });

  await openLiveElection(adminPage, election.id);
  await expect(adminPage.getByText('Segundo turno entre Ana e Bia.')).toBeVisible();
  await expect(adminPage.getByText('O próximo cargo aguarda o segundo turno.')).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Abrir segundo turno' })).toBeVisible();
});

test('opens the runoff from the live panel and elects one of its two finalists', async ({
  admin,
  adminPage,
  election,
  request,
}) => {
  const { race, voterTokens } = await prepareRunoffScenario(request, election.id, admin.token);

  await openLiveElection(adminPage, election.id);
  await adminPage.getByRole('button', { name: 'Abrir segundo turno' }).click();
  await expect(adminPage.getByText('Votação em andamento: Mayor')).toBeVisible();

  const ballot = await readVoterBallot(request, voterTokens[0]);
  expect({
    phase: ballot.phase,
    kind: ballot.round?.kind,
    candidates: ballot.round?.candidates,
  }).toEqual({
    phase: 'VOTING',
    kind: 'RUNOFF',
    candidates: [
      { id: race.anaId, name: 'Ana' },
      { id: race.biaId, name: 'Bia' },
    ],
  });

  const openedStateResponse = await request.get(`/api/elections/${election.id}`, {
    headers: authorizationHeaders(admin.token),
  });
  await expectStatus(openedStateResponse, 200, 'Read opened runoff');
  const runoffRoundId = ((await openedStateResponse.json()) as ElectionState).currentRound?.roundId;
  if (runoffRoundId === undefined) {
    throw new Error('Opened runoff did not return a round identifier.');
  }

  await castVote({
    request,
    voterToken: voterTokens[0],
    roundId: runoffRoundId,
    candidateId: race.anaId,
  });
  await castVote({
    request,
    voterToken: voterTokens[1],
    roundId: runoffRoundId,
    candidateId: race.anaId,
  });
  await castVote({
    request,
    voterToken: voterTokens[2],
    roundId: runoffRoundId,
    candidateId: race.biaId,
  });
  await castVote({
    request,
    voterToken: voterTokens[3],
    roundId: runoffRoundId,
    candidateId: race.biaId,
  });
  await castVote({
    request,
    voterToken: voterTokens[4],
    roundId: runoffRoundId,
    candidateId: race.biaId,
  });

  await expect(adminPage.getByText('Pessoa eleita: Bia.')).toBeVisible();
  await expect(adminPage.getByText('Bia: 3 votos')).toBeVisible();

  const finalResponse = await request.get(`/api/elections/${election.id}`, {
    headers: authorizationHeaders(admin.token),
  });
  await expectStatus(finalResponse, 200, 'Read elected runoff result');
  const finalState = (await finalResponse.json()) as ElectionState;
  expect({
    positionStatus: finalState.election.positions.find(({ id }) => id === race.positionId)?.status,
    electedCandidateId: finalState.election.positions.find(({ id }) => id === race.positionId)
      ?.electedCandidateId,
    outcome: finalState.lastResult?.outcome,
    resultCandidateId: finalState.lastResult?.electedCandidateId,
  }).toEqual({
    positionStatus: 'DECIDED',
    electedCandidateId: race.biaId,
    outcome: 'ELECTED',
    resultCandidateId: race.biaId,
  });
});
