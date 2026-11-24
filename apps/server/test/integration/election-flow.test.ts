import type { AdminElectionDTO, VoterStateDTO } from '@voto/shared';
import { describe, expect, it, onTestFinished } from 'vitest';
import { makeTestApp, type TestApp } from '../support/make-test-app';
import { StubCodeGenerator } from '../doubles/stub-code-generator';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;

const ADMIN_USERNAME = 'ana';
const ADMIN_PASSWORD = 's3cret';
const VOTER_CODES = ['ABCD2345', 'WXYZ6789', 'HJKM3456'] as const;

type Headers = Readonly<{ authorization: string }>;

/**
 * Monta o app de teste com os três códigos de eleitor já definidos e a admin Ana cadastrada.
 * O app é fechado ao fim do teste.
 *
 * @returns O app de teste.
 */
async function appWithAdminAna(): Promise<TestApp> {
  const test = makeTestApp({ codeGenerator: new StubCodeGenerator([...VOTER_CODES]) });
  onTestFinished(async () => {
    await test.app.close();
  });
  await test.auth.seedAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
  return test;
}

/**
 * Passo 1: a Ana entra com usuário e senha e recebe o token de admin.
 *
 * @param test - App de teste.
 * @returns O cabeçalho de autorização da Ana.
 */
async function logIn(test: TestApp): Promise<Headers> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(OK);
  return { authorization: `Bearer ${response.json<{ token: string }>().token}` };
}

/**
 * Faz uma requisição de admin e confere o status esperado.
 *
 * @param test - App de teste.
 * @param request - Método, rota, corpo e cabeçalho; `status` é o código HTTP esperado.
 * @returns O corpo da resposta como `AdminElectionDTO`.
 */
async function adminCall(
  test: TestApp,
  request: {
    method: 'POST' | 'GET';
    url: string;
    headers: Headers;
    payload?: object;
    status: number;
  },
): Promise<AdminElectionDTO> {
  const response = await test.app.inject({
    method: request.method,
    url: request.url,
    headers: request.headers,
    ...(request.payload ? { payload: request.payload } : {}),
  });
  expect(response.statusCode).toBe(request.status);
  return response.json<AdminElectionDTO>();
}

/**
 * Passo 2: cria a eleição com o cargo Mayor e os candidatos Ana e Bia.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @returns Os ids da eleição, do cargo e dos candidatos Ana e Bia.
 */
async function createMayorRace(test: TestApp, admin: Headers): Promise<Race> {
  const created = await adminCall(test, {
    method: 'POST',
    url: '/api/elections',
    headers: admin,
    payload: { name: 'Student Union 2027' },
    status: CREATED,
  });
  const electionId = created.election.id;
  const withPosition = await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${electionId}/positions`,
    headers: admin,
    payload: { title: 'Mayor', tiebreak: 'OLDEST' },
    status: CREATED,
  });
  const positionId = withPosition.election.positions[0]?.id ?? 'missing';
  await addCandidate(test, admin, { electionId, positionId, name: 'Ana', age: 30 });
  const withBoth = await addCandidate(test, admin, {
    electionId,
    positionId,
    name: 'Bia',
    age: 25,
  });
  return {
    electionId,
    positionId,
    anaId: candidateIdByName(withBoth, 'Ana'),
    biaId: candidateIdByName(withBoth, 'Bia'),
  };
}

/** Eleição montada no passo 2. */
interface Race {
  readonly electionId: string;
  readonly positionId: string;
  readonly anaId: string;
  readonly biaId: string;
}

/**
 * Cadastra um candidato ao cargo.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param candidate - Eleição, cargo, nome e idade do candidato.
 * @returns O estado da eleição depois do cadastro.
 */
function addCandidate(
  test: TestApp,
  admin: Headers,
  candidate: { electionId: string; positionId: string; name: string; age: number },
): Promise<AdminElectionDTO> {
  return adminCall(test, {
    method: 'POST',
    url: `/api/elections/${candidate.electionId}/candidates`,
    headers: admin,
    payload: {
      name: candidate.name,
      age: candidate.age,
      remainingMonths: 12,
      applications: [candidate.positionId],
      firstChoicePositionId: candidate.positionId,
    },
    status: CREATED,
  });
}

/**
 * Acha o id de um candidato pelo nome.
 *
 * @param dto - Estado da eleição.
 * @param name - Nome do candidato.
 * @returns O id do candidato.
 */
function candidateIdByName(dto: AdminElectionDTO, name: string): string {
  return dto.election.candidates.find((candidate) => candidate.name === name)?.id ?? 'missing';
}

/**
 * Passo 3: gera os três códigos de eleitor e abre a eleição.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param electionId - Eleição em rascunho.
 * @returns Os códigos gerados.
 */
async function credentialThreeVotersAndOpen(
  test: TestApp,
  admin: Headers,
  electionId: string,
): Promise<[string, string, string]> {
  const response = await test.app.inject({
    method: 'POST',
    url: `/api/elections/${electionId}/voters`,
    headers: admin,
    payload: { count: VOTER_CODES.length },
  });
  expect(response.statusCode).toBe(CREATED);
  await adminCall(test, {
    method: 'POST',
    url: `/api/elections/${electionId}/open`,
    headers: admin,
    status: OK,
  });
  return response.json<{ codes: [string, string, string] }>().codes;
}

/**
 * Passo 4: um eleitor entra com o próprio código.
 *
 * @param test - App de teste.
 * @param code - Código do eleitor.
 * @returns O cabeçalho de autorização do eleitor.
 */
async function startVoterSession(test: TestApp, code: string): Promise<Headers> {
  const response = await test.app.inject({
    method: 'POST',
    url: '/api/voter/session',
    payload: { code },
  });
  expect(response.statusCode).toBe(OK);
  return { authorization: `Bearer ${response.json<{ token: string }>().token}` };
}

/**
 * Passo 5a: o admin abre a rodada do cargo.
 *
 * @param test - App de teste.
 * @param admin - Cabeçalho da admin.
 * @param ids - Eleição e cargo.
 * @returns O id da rodada aberta.
 */
async function openRound(
  test: TestApp,
  admin: Headers,
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
 * Passo 5b: um eleitor vota em um candidato.
 *
 * @param test - App de teste.
 * @param voter - Cabeçalho do eleitor.
 * @param vote - Rodada e candidato escolhido.
 */
async function castVote(
  test: TestApp,
  voter: Headers,
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
 * Consulta o estado do eleitor.
 *
 * @param test - App de teste.
 * @param voter - Cabeçalho do eleitor.
 * @returns O estado que a tela do eleitor mostraria.
 */
async function voterState(test: TestApp, voter: Headers): Promise<VoterStateDTO> {
  const response = await test.app.inject({
    method: 'GET',
    url: '/api/voter/state',
    headers: voter,
  });
  expect(response.statusCode).toBe(OK);
  return response.json<VoterStateDTO>();
}

describe('full election over HTTP', () => {
  it('runs a single-position election from login to released results', async () => {
    const test = await appWithAdminAna();
    const admin = await logIn(test);
    const race = await createMayorRace(test, admin);
    const [firstCode, secondCode, thirdCode] = await credentialThreeVotersAndOpen(
      test,
      admin,
      race.electionId,
    );
    const firstVoter = await startVoterSession(test, firstCode);
    const secondVoter = await startVoterSession(test, secondCode);
    const thirdVoter = await startVoterSession(test, thirdCode);
    const roundId = await openRound(test, admin, race);

    await castVote(test, firstVoter, { roundId, choice: race.anaId });
    await castVote(test, secondVoter, { roundId, choice: race.anaId });
    await castVote(test, thirdVoter, { roundId, choice: race.biaId });

    // O último voto fecha a rodada sozinho; o admin já vê o resultado, o eleitor ainda não.
    const afterVotes = await adminCall(test, {
      method: 'GET',
      url: `/api/elections/${race.electionId}`,
      headers: admin,
      status: OK,
    });
    expect(afterVotes.currentRound).toBeUndefined();
    expect(afterVotes.lastResult).toMatchObject({
      outcome: 'ELECTED',
      electedCandidateId: race.anaId,
    });
    expect(await voterState(test, firstVoter)).toMatchObject({ phase: 'WAITING' });

    await adminCall(test, {
      method: 'POST',
      url: `/api/elections/${race.electionId}/rounds/${roundId}/release`,
      headers: admin,
      status: OK,
    });
    expect(await voterState(test, thirdVoter)).toMatchObject({
      phase: 'RESULTS',
      result: { outcome: 'ELECTED', electedCandidateId: race.anaId, validVotes: 3 },
    });
  });
});
