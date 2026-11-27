import { expect, test as base } from '@playwright/test';
import type {
  APIRequestContext,
  APIResponse,
  BrowserContext,
  Page,
  TestInfo,
} from '@playwright/test';

const ADMIN_USERNAME = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-password';
const ADMIN_TOKEN_STORAGE_KEY = 'voto:admin-token';

interface AdminSession {
  readonly token: string;
  readonly identity: {
    readonly id: string;
    readonly username: string;
  };
}

interface DraftElection {
  readonly id: string;
}

interface ReadyElection {
  readonly electionId: string;
  readonly positionId: string;
  readonly candidateId: string;
  readonly codes: readonly string[];
  readonly status: string;
}

interface E2EFixtures {
  readonly admin: AdminSession;
  readonly election: DraftElection;
  readonly readyElection: ReadyElection;
  readonly adminPage: Page;
  readonly cleanContext: BrowserContext;
}

/**
 * Ensures an API setup operation succeeded and reports its response when it did not.
 *
 * @param response - Response returned by the real local API.
 * @param operation - Setup operation being performed.
 * @returns Resolves when the API returned a successful status.
 * @throws {Error} When the API rejects the setup operation.
 */
async function assertApiSuccess(response: APIResponse, operation: string): Promise<void> {
  if (response.ok()) return;

  throw new Error(`${operation} failed with ${response.status()}: ${await response.text()}`);
}

/**
 * Confirms that decoded API JSON is an object before its fields are used.
 *
 * @param value - Decoded JSON payload.
 * @param operation - API operation that produced the payload.
 * @returns The payload as a record.
 * @throws {Error} When the API does not return a JSON object.
 */
function readObject(value: unknown, operation: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${operation} returned an invalid JSON object.`);
  }
  return Object.entries(value).reduce<Record<string, unknown>>(
    (record, [key, field]) => ({ ...record, [key]: field }),
    {},
  );
}

/**
 * Reads a required string field from a validated API object.
 *
 * @param object - Object returned by the API.
 * @param field - Required field name.
 * @param operation - API operation that produced the object.
 * @returns The requested non-empty string.
 * @throws {Error} When the required field is missing or not a string.
 */
function readStringField(
  object: Record<string, unknown>,
  field: string,
  operation: string,
): string {
  const value = object[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${operation} did not return a valid ${field}.`);
  }
  return value;
}

/**
 * Narrows unknown API array entries to strings.
 *
 * @param value - API value to validate.
 * @returns Whether the value is a string.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Creates a draft election for a single E2E test through the administrator API.
 *
 * @param request - Playwright API context connected to the local application.
 * @param token - Authenticated administrator token.
 * @param testInfo - Metadata used to make the election name unique per test.
 * @returns The new election identifier.
 * @throws {Error} When creation fails or the response omits the election identifier.
 */
async function createDraftElection(
  request: APIRequestContext,
  token: string,
  testInfo: TestInfo,
): Promise<DraftElection> {
  const response = await request.post('/api/elections', {
    headers: { authorization: `Bearer ${token}` },
    data: { name: `E2E ${testInfo.testId}` },
  });
  await assertApiSuccess(response, 'Create election');
  const payload = readObject(await response.json(), 'Create election');
  const election = readObject(payload.election, 'Create election');
  return { id: readStringField(election, 'id', 'Create election') };
}

export const test = base.extend<E2EFixtures>({
  admin: async ({ request }, use) => {
    const loginResponse = await request.post('/api/admin/login', {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    await assertApiSuccess(loginResponse, 'Administrator login');
    const loginPayload = readObject(await loginResponse.json(), 'Administrator login');
    const token = readStringField(loginPayload, 'token', 'Administrator login');

    const identityResponse = await request.get('/api/admin/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    await assertApiSuccess(identityResponse, 'Read administrator identity');
    const identityPayload = readObject(
      await identityResponse.json(),
      'Read administrator identity',
    );
    await use({
      token,
      identity: {
        id: readStringField(identityPayload, 'id', 'Read administrator identity'),
        username: readStringField(identityPayload, 'username', 'Read administrator identity'),
      },
    });
  },

  election: async ({ admin, request }, use, testInfo) => {
    await use(await createDraftElection(request, admin.token, testInfo));
  },

  readyElection: async ({ admin, election, request }, use) => {
    const authorization = { authorization: `Bearer ${admin.token}` };
    const positionResponse = await request.post(`/api/elections/${election.id}/positions`, {
      headers: authorization,
      data: { title: 'President', tiebreak: 'MOST_REMAINING_TIME' },
    });
    await assertApiSuccess(positionResponse, 'Create position');
    const positionPayload = readObject(await positionResponse.json(), 'Create position');
    const positionElection = readObject(positionPayload.election, 'Create position');
    const positions = positionElection.positions;
    if (!Array.isArray(positions) || positions.length === 0) {
      throw new Error('Create position did not return a position.');
    }
    const position = readObject(positions[0], 'Create position');
    const positionId = readStringField(position, 'id', 'Create position');

    const candidateResponse = await request.post(`/api/elections/${election.id}/candidates`, {
      headers: authorization,
      data: {
        name: 'Alex Candidate',
        age: 30,
        remainingMonths: 12,
        applications: [positionId],
        firstChoicePositionId: positionId,
      },
    });
    await assertApiSuccess(candidateResponse, 'Create candidate');
    const candidatePayload = readObject(await candidateResponse.json(), 'Create candidate');
    const candidateElection = readObject(candidatePayload.election, 'Create candidate');
    const candidates = candidateElection.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Create candidate did not return a candidate.');
    }
    const candidate = readObject(candidates[0], 'Create candidate');
    const candidateId = readStringField(candidate, 'id', 'Create candidate');

    const voterResponse = await request.post(`/api/elections/${election.id}/voters`, {
      headers: authorization,
      data: { count: 3, labels: ['Voter 1', 'Voter 2', 'Voter 3'] },
    });
    await assertApiSuccess(voterResponse, 'Create voter credentials');
    const voterPayload = readObject(await voterResponse.json(), 'Create voter credentials');
    const codesValue: unknown = voterPayload.codes;
    if (!Array.isArray(codesValue)) {
      throw new Error('Create voter credentials did not return valid codes.');
    }
    const codes = codesValue.filter(isString);
    if (codes.length !== codesValue.length) {
      throw new Error('Create voter credentials did not return valid codes.');
    }

    const openResponse = await request.post(`/api/elections/${election.id}/open`, {
      headers: authorization,
    });
    await assertApiSuccess(openResponse, 'Open election');
    const openPayload = readObject(await openResponse.json(), 'Open election');
    const openElection = readObject(openPayload.election, 'Open election');
    const status = readStringField(openElection, 'status', 'Open election');

    await use({ electionId: election.id, positionId, candidateId, codes, status });
  },

  adminPage: async ({ admin, page }, use) => {
    await page.addInitScript(
      ({ token, storageKey }) => window.sessionStorage.setItem(storageKey, token),
      { token: admin.token, storageKey: ADMIN_TOKEN_STORAGE_KEY },
    );
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Administrator dashboard' })).toBeVisible();
    await use(page);
  },

  cleanContext: async ({ adminPage, browser }, use) => {
    const context = await browser.newContext({
      baseURL: new URL(adminPage.url()).origin,
    });
    await use(context);
    await context.close();
  },
});

export { expect };
