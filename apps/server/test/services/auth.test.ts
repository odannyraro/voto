import { describe, expect, it } from 'vitest';
import { InMemoryAdminRepository } from '../../src/adapters/in-memory-admin-repository';
import { HttpError } from '../../src/http/errors';
import { AuthService } from '../../src/services/auth';
import { FakeClock } from '../doubles/fake-clock';

const FAST_BCRYPT_ROUNDS = 4;
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ONE_SECOND_MS = 1000;
const START = new Date('2026-01-01T12:00:00.000Z');

/**
 * Cria um `AuthService` com repositório em memória, relógio falso e bcrypt rápido.
 *
 * @param overrides - Segredo do JWT, quando o teste precisa de dois serviços diferentes.
 * @returns O serviço, o repositório de admins e o relógio, para o teste inspecionar ou avançar.
 */
function makeAuth(overrides: { jwtSecret?: string } = {}) {
  const adminRepository = new InMemoryAdminRepository();
  const clock = new FakeClock(START);
  let nextId = 0;
  const auth = new AuthService({
    adminRepository,
    clock,
    jwtSecret: overrides.jwtSecret ?? 'test-secret',
    bcryptRounds: FAST_BCRYPT_ROUNDS,
    newId: () => `admin-${++nextId}`,
  });
  return { auth, adminRepository, clock };
}

/**
 * Captura o motivo da rejeição de uma promessa, para comparar duas rejeições entre si.
 *
 * @param promise - Promessa que deve ser rejeitada.
 * @returns O erro da rejeição, ou `undefined` se a promessa foi resolvida.
 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('password hashing', () => {
  it('verifies the original password against its hash', async () => {
    const { auth } = makeAuth();

    const hash = await auth.hashPassword('s3cret');

    expect(await auth.verifyPassword('s3cret', hash)).toBe(true);
  });

  it('rejects a different password against the hash', async () => {
    const { auth } = makeAuth();

    const hash = await auth.hashPassword('s3cret');

    expect(await auth.verifyPassword('S3cret', hash)).toBe(false);
  });

  it('does not store the password as plain text', async () => {
    const { auth } = makeAuth();

    const hash = await auth.hashPassword('s3cret');

    expect(hash).not.toContain('s3cret');
  });

  it('produces a different hash each time for the same password', async () => {
    const { auth } = makeAuth();

    const first = await auth.hashPassword('s3cret');
    const second = await auth.hashPassword('s3cret');

    expect(first).not.toBe(second);
  });
});

describe('login', () => {
  it('returns a token that verifies as the admin', async () => {
    const { auth } = makeAuth();
    await auth.seedAdmin('root', 's3cret');

    const token = await auth.login('root', 's3cret');

    expect(await auth.verifyToken(token)).toEqual({ role: 'admin', adminId: 'admin-1' });
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const { auth } = makeAuth();
    await auth.seedAdmin('root', 's3cret');

    const error = await rejectionOf(auth.login('root', 'wrong'));

    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('answers an unknown username exactly like a wrong password', async () => {
    const { auth } = makeAuth();
    await auth.seedAdmin('root', 's3cret');

    const wrongPassword = await rejectionOf(auth.login('root', 'wrong'));
    const unknownUser = await rejectionOf(auth.login('ghost', 's3cret'));

    expect(unknownUser).toEqual(wrongPassword);
  });
});

describe('seedAdmin', () => {
  it('creates a single admin when called twice', async () => {
    const { auth, adminRepository } = makeAuth();

    await auth.seedAdmin('root', 's3cret');
    await auth.seedAdmin('root', 's3cret');

    expect(await adminRepository.findById('admin-1')).toMatchObject({ username: 'root' });
    expect(await adminRepository.findById('admin-2')).toBeNull();
  });

  it('keeps the existing password when called again with another one', async () => {
    const { auth } = makeAuth();
    await auth.seedAdmin('root', 's3cret');

    await auth.seedAdmin('root', 'other');

    await expect(auth.login('root', 's3cret')).resolves.toEqual(expect.any(String));
  });

  it('stores only the password hash', async () => {
    const { auth, adminRepository } = makeAuth();

    await auth.seedAdmin('root', 's3cret');

    const admin = await adminRepository.findByUsername('root');
    expect(admin?.passwordHash).not.toContain('s3cret');
  });
});

describe('admin token expiry', () => {
  it('is still valid one second before 12 hours', async () => {
    const { auth, clock } = makeAuth();
    const token = await auth.issueAdminToken('admin-1');

    clock.advance(ADMIN_TOKEN_TTL_MS - ONE_SECOND_MS);

    expect(await auth.verifyToken(token)).toEqual({ role: 'admin', adminId: 'admin-1' });
  });

  it('is rejected once 12 hours have passed', async () => {
    const { auth, clock } = makeAuth();
    const token = await auth.issueAdminToken('admin-1');

    clock.advance(ADMIN_TOKEN_TTL_MS);

    const error = await rejectionOf(auth.verifyToken(token));
    expect(error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });
});

describe('voter token', () => {
  it('carries the election and voter ids', async () => {
    const { auth } = makeAuth();

    const token = await auth.issueVoterToken({ electionId: 'e1', voterId: 'e1:ABCD2345' });

    expect(await auth.verifyToken(token)).toEqual({
      role: 'voter',
      electionId: 'e1',
      voterId: 'e1:ABCD2345',
    });
  });
});

describe('verifyToken', () => {
  it('rejects a token whose payload was tampered with', async () => {
    const { auth } = makeAuth();
    const token = await auth.issueVoterToken({ electionId: 'e1', voterId: 'v1' });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ role: 'admin', sub: 'admin-1', exp: 9999999999 }),
    ).toString('base64url');

    const error = await rejectionOf(auth.verifyToken(`${header}.${forgedPayload}.${signature}`));

    expect(error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });

  it('rejects a token signed with another secret', async () => {
    const issuer = makeAuth({ jwtSecret: 'other-secret' }).auth;
    const verifier = makeAuth({ jwtSecret: 'test-secret' }).auth;
    const token = await issuer.issueAdminToken('admin-1');

    const error = await rejectionOf(verifier.verifyToken(token));

    expect(error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });

  it('rejects text that is not a token', async () => {
    const { auth } = makeAuth();

    const error = await rejectionOf(auth.verifyToken('not-a-jwt'));

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });
});
