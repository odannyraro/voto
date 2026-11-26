import type { AdminElectionDTO, NextPositionDTO, TiebreakRule, VoterStateDTO } from '@voto/shared';
import { expect, onTestFinished } from 'vitest';
import type { AppDeps } from '../../src/app';
import { StubCodeGenerator } from '../doubles/stub-code-generator';
import { makeTestApp, type TestApp } from './make-test-app';

// Passos nomeados dos cenários de integração (test/integration): cada um faz uma chamada HTTP
// real (`app.inject`) e confere o status esperado, para o cenário ler como a jornada do admin.

export const OK = 200;
export const CREATED = 201;
export const NO_CONTENT = 204;

const ADMIN_USERNAME = 'ana';
const ADMIN_PASSWORD = 's3cret';
// Os cenários não dependem de idade nem de tempo restante, salvo quando dizem o contrário.
const ANY_AGE = 30;
const ANY_REMAINING_MONTHS = 12;

/** Cabeçalho de autorização de um admin ou eleitor. */
export type AuthHeaders = Readonly<{ authorization: string }>;

/** Requisição de admin feita por `adminCall`. */
export interface AdminRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: AuthHeaders;
  readonly payload?: object;
  /** Status HTTP esperado. */
  readonly status: number;
}

/** Eleição com o cargo Mayor e os candidatos Ana e Bia (ver `createMayorRace`). */
export interface Race {
  readonly electionId: string;
  readonly positionId: string;
  readonly anaId: string;
  readonly biaId: string;
}

/**
 * Monta o app de teste com a admin Ana cadastrada e os códigos de eleitor que o gerador vai
 * entregar, na ordem. O app é fechado ao fim do teste.
 *
 * @param voterCodes - Códigos que o credenciamento vai gerar.
 * @param overrides - Dependências a trocar (ex.: repositórios PostgreSQL).
 * @returns O app de teste.
 */
export async function appWithAdminAna(
  voterCodes: readonly string[],
  overrides: Partial<AppDeps> = {},
): Promise<TestApp> {
  const test = makeTestApp({ codeGenerator: new StubCodeGenerator(voterCodes), ...overrides });
  onTestFinished(async () => {
    await test.app.close();
  });
  await test.auth.seedAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
  return test;
}

/**
 * A Ana entra com usuário e senha e recebe o token de admin.
 *
 * @param test - App de teste.
 * @returns O cabeçalho de autorização da Ana.
 */
export async function logIn(test: TestApp): Promise<AuthHeaders> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(OK);
  return bearer(response.json<{ token: string }>().token);
}

/**
 * Faz uma requisição de admin e confere o status esperado.
 *
 * @param test - App de teste.
 * @param request - Método, rota, corpo, cabeçalho e status esperado.
 * @returns O corpo da resposta (por padrão, o `AdminElectionDTO`).
 */
export async function adminCall<Body = AdminElectionDTO>(
  test: TestApp,
  request: AdminRequest,
): Promise<Body> {
  const response = await test.app.inject({
    method: request.method,
    url: request.url,
    headers: request.headers,
    ...(request.payload ? { payload: request.payload } : {}),
  });
  expect(response.statusCode).toBe(request.status);
  return response.json<Body>();
}

/**
 * Cria uma eleição em rascunho.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param name - Nome da eleição.
 * @returns O id da eleição.
 */
export async function createElection(
  test: TestApp,
  admin: AuthHeaders,
  name: string,
): Promise<string> {
  const created = await adminCall(test, {
    method: 'POST',
    url: '/api/elections',
    headers: admin,
    payload: { name },
    status: CREATED,
  });
  return created.election.id;
}

/**
 * Acrescenta um cargo ao fim da fila da eleição.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param position - Eleição, título e desempate (padrão `OLDEST`) do cargo.
 * @returns O id do cargo.
 */
export async function addPosition(
  test: TestApp,
  admin: AuthHeaders,
  position: { electionId: string; title: string; tiebreak?: TiebreakRule },
): Promise<string> {
  const dto = await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${position.electionId}/positions`,
    headers: admin,
    payload: { title: position.title, tiebreak: position.tiebreak ?? 'OLDEST' },
    status: CREATED,
  });
  return dto.election.positions.find((p) => p.title === position.title)?.id ?? 'missing';
}

/**
 * Cadastra um candidato; a primeira opção é o primeiro cargo de `applications`.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param candidate - Eleição, nome, cargos a que concorre e idade (opcional).
 * @returns O id do candidato.
 */
export async function addCandidate(
  test: TestApp,
  admin: AuthHeaders,
  candidate: { electionId: string; name: string; applications: string[]; age?: number },
): Promise<string> {
  const dto = await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${candidate.electionId}/candidates`,
    headers: admin,
    payload: {
      name: candidate.name,
      age: candidate.age ?? ANY_AGE,
      remainingMonths: ANY_REMAINING_MONTHS,
      applications: candidate.applications,
      firstChoicePositionId: candidate.applications[0],
    },
    status: CREATED,
  });
  return dto.election.candidates.find((c) => c.name === candidate.name)?.id ?? 'missing';
}

/**
 * Cria a eleição com o cargo Mayor e os candidatos Ana (30 anos) e Bia (25 anos).
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @returns Os ids da eleição, do cargo e dos candidatos.
 */
export async function createMayorRace(test: TestApp, admin: AuthHeaders): Promise<Race> {
  const electionId = await createElection(test, admin, 'Student Union 2027');
  const positionId = await addPosition(test, admin, { electionId, title: 'Mayor' });
  const applications = [positionId];
  const anaId = await addCandidate(test, admin, { electionId, name: 'Ana', applications, age: 30 });
  const biaId = await addCandidate(test, admin, { electionId, name: 'Bia', applications, age: 25 });
  return { electionId, positionId, anaId, biaId };
}

/**
 * Gera os códigos de eleitor (os que o `StubCodeGenerator` do app entrega) e abre a eleição.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param voters - Eleição em rascunho e quantos códigos gerar.
 */
export async function credentialVotersAndOpen(
  test: TestApp,
  admin: AuthHeaders,
  voters: { electionId: string; count: number },
): Promise<void> {
  const response = await test.app.inject({
    method: 'POST',
    url: `/api/elections/${voters.electionId}/voters`,
    headers: admin,
    payload: { count: voters.count },
  });
  expect(response.statusCode).toBe(CREATED);
  await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${voters.electionId}/open`,
    headers: admin,
    status: OK,
  });
}

/**
 * Um eleitor entra com o próprio código.
 *
 * @param test - App de teste.
 * @param code - Código do eleitor.
 * @returns O cabeçalho de autorização do eleitor.
 */
export async function startVoterSession(test: TestApp, code: string): Promise<AuthHeaders> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/voter/session',
    payload: { code },
  });
  expect(response.statusCode).toBe(OK);
  return bearer(response.json<{ token: string }>().token);
}

/** Um cabeçalho de eleitor para cada código de uma tupla, na mesma posição. */
export type VoterHeaders<Codes extends readonly string[]> = {
  -readonly [Index in keyof Codes]: AuthHeaders;
};

/**
 * Cada código abre a sua sessão de eleitor, na ordem.
 *
 * @param test - App de teste.
 * @param codes - Códigos já credenciados (tupla constante, para o teste desestruturar).
 * @returns Os cabeçalhos dos eleitores, na ordem dos códigos.
 */
export async function startVoterSessions<const Codes extends readonly string[]>(
  test: TestApp,
  codes: Codes,
): Promise<VoterHeaders<Codes>> {
  const voters: AuthHeaders[] = [];
  for (const code of codes) voters.push(await startVoterSession(test, code));
  // Um cabeçalho por código, na mesma ordem: o tamanho da tupla é preservado.
  return voters as VoterHeaders<Codes>;
}

/**
 * O admin abre o 1º turno de um cargo.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param ids - Eleição e cargo.
 * @returns O id da rodada aberta.
 */
export async function openRound(
  test: TestApp,
  admin: AuthHeaders,
  ids: { electionId: string; positionId: string },
): Promise<string> {
  const opened = await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${ids.electionId}/rounds`,
    headers: admin,
    payload: { positionId: ids.positionId },
    status: CREATED,
  });
  return opened.currentRound?.roundId ?? 'missing';
}

/**
 * Um eleitor vota em um candidato (ou em branco).
 *
 * @param test - App de teste.
 * @param voter - Cabeçalho do eleitor.
 * @param vote - Rodada e escolha.
 */
export async function castVote(
  test: TestApp,
  voter: AuthHeaders,
  vote: { roundId: string; choice: string },
): Promise<void> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/voter/votes',
    headers: voter,
    payload: vote,
  });
  expect(response.statusCode).toBe(NO_CONTENT);
}

/**
 * Cada eleitor vota na escolha da mesma posição da lista, na ordem.
 *
 * @param test - App de teste.
 * @param roundId - Rodada aberta.
 * @param ballots - Pares eleitor e escolha.
 */
export async function castVotes(
  test: TestApp,
  roundId: string,
  ballots: readonly (readonly [AuthHeaders, string])[],
): Promise<void> {
  for (const [voter, choice] of ballots) await castVote(test, voter, { roundId, choice });
}

/**
 * Consulta o estado do eleitor.
 *
 * @param test - App de teste.
 * @param voter - Cabeçalho do eleitor.
 * @returns O estado que a tela do eleitor mostraria.
 */
export async function voterState(test: TestApp, voter: AuthHeaders): Promise<VoterStateDTO> {
  const response = await test.app.inject({
    method: 'GET',
    url: '/api/voter/state',
    headers: voter,
  });
  expect(response.statusCode).toBe(OK);
  return response.json<VoterStateDTO>();
}

/**
 * Consulta a eleição como o painel do admin a vê.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param electionId - Eleição.
 * @returns O estado da eleição para o admin.
 */
export function adminView(
  test: TestApp,
  admin: AuthHeaders,
  electionId: string,
): Promise<AdminElectionDTO> {
  return adminCall(test, {
    method: 'GET',
    url: `/api/elections/${electionId}`,
    headers: admin,
    status: OK,
  });
}

/**
 * Pergunta qual é o próximo passo da fila.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param electionId - Eleição.
 * @returns O próximo cargo e o seu status.
 */
export function nextStep(
  test: TestApp,
  admin: AuthHeaders,
  electionId: string,
): Promise<NextPositionDTO> {
  return adminCall<NextPositionDTO>(test, {
    method: 'GET',
    url: `/api/elections/${electionId}/next`,
    headers: admin,
    status: OK,
  });
}

/**
 * O admin libera aos eleitores o resultado de uma rodada fechada.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param ids - Eleição e rodada.
 * @returns O estado da eleição depois da liberação.
 */
export function releaseResults(
  test: TestApp,
  admin: AuthHeaders,
  ids: { electionId: string; roundId: string },
): Promise<AdminElectionDTO> {
  return adminCall(test, {
    method: 'POST',
    url: `/api/elections/${ids.electionId}/rounds/${ids.roundId}/release`,
    headers: admin,
    status: OK,
  });
}

/**
 * Monta o cabeçalho `Authorization` a partir de um token.
 *
 * @param token - JWT emitido pelo servidor.
 * @returns O cabeçalho pronto para o `inject`.
 */
function bearer(token: string): AuthHeaders {
  return { authorization: `Bearer ${token}` };
}
