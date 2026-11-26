import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  JWT_SECRET: 'production-secret',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin-password',
};

describe('loadConfig', () => {
  describe('defaults', () => {
    it('applies the documented defaults when the environment is empty', () => {
      const config = loadConfig({});

      expect(config).toEqual({
        port: 3000,
        nodeEnv: 'development',
        jwtSecret: expect.stringMatching(/\S/),
        repository: 'memory',
        bcryptRounds: 10,
        voteGraceMs: 1000,
        historyLimit: 50,
        rateLimit: true,
        trustProxyHops: 0,
      });
    });

    it('uses the same fixed JWT secret in development and test', () => {
      const development = loadConfig({ NODE_ENV: 'development' });
      const test = loadConfig({ NODE_ENV: 'test' });

      expect(test.jwtSecret).toBe(development.jwtSecret);
    });

    it('treats an empty variable as not set', () => {
      const config = loadConfig({ PORT: '', REPOSITORY: '', JWT_SECRET: '' });

      expect(config).toMatchObject({ port: 3000, repository: 'memory' });
    });
  });

  describe('reading values', () => {
    it('reads every variable from the environment', () => {
      const config = loadConfig({
        PORT: '8080',
        NODE_ENV: 'test',
        JWT_SECRET: 'my-secret',
        ADMIN_USERNAME: 'root',
        ADMIN_PASSWORD: 'toor',
        REPOSITORY: 'pg',
        DATABASE_URL: 'postgres://localhost/voto',
        BCRYPT_ROUNDS: '4',
        VOTE_GRACE_MS: '250',
        HISTORY_LIMIT: '10',
        WEB_DIST_DIR: 'apps/web/dist',
        RATE_LIMIT: 'off',
        TRUST_PROXY_HOPS: '1',
      });

      expect(config).toEqual({
        port: 8080,
        nodeEnv: 'test',
        jwtSecret: 'my-secret',
        adminUsername: 'root',
        adminPassword: 'toor',
        repository: 'pg',
        databaseUrl: 'postgres://localhost/voto',
        bcryptRounds: 4,
        voteGraceMs: 250,
        historyLimit: 10,
        webDistDir: 'apps/web/dist',
        rateLimit: false,
        trustProxyHops: 1,
      });
    });
  });

  describe('production', () => {
    it('accepts a complete production environment', () => {
      const config = loadConfig(PRODUCTION_ENV);

      expect(config).toMatchObject({
        nodeEnv: 'production',
        jwtSecret: 'production-secret',
        adminUsername: 'admin',
        adminPassword: 'admin-password',
      });
    });

    it.each(['JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'])(
      'fails in production without %s',
      (missing) => {
        const env = { ...PRODUCTION_ENV, [missing]: undefined };

        expect(() => loadConfig(env)).toThrow(`${missing}: is required in production`);
      },
    );
  });

  describe('repository', () => {
    it('fails when REPOSITORY is pg and DATABASE_URL is missing', () => {
      expect(() => loadConfig({ REPOSITORY: 'pg' })).toThrow(
        'DATABASE_URL: is required when REPOSITORY is pg',
      );
    });

    // Banco real é ambiente real: o segredo de dev está no repositório e forjaria tokens de admin.
    it.each(['development', 'test'])(
      'fails when REPOSITORY is pg and JWT_SECRET is missing, even in %s',
      (nodeEnv) => {
        const env = { NODE_ENV: nodeEnv, REPOSITORY: 'pg', DATABASE_URL: 'postgres://db/voto' };

        expect(() => loadConfig(env)).toThrow('JWT_SECRET: is required when REPOSITORY is pg');
      },
    );

    it('reports a missing JWT_SECRET only once in production with pg', () => {
      const env = {
        ...PRODUCTION_ENV,
        JWT_SECRET: undefined,
        REPOSITORY: 'pg',
        DATABASE_URL: 'postgres://db/voto',
      };

      expect(() => loadConfig(env)).toThrow(
        /^Invalid environment configuration:\n- JWT_SECRET: is required in production$/,
      );
    });

    it('does not require DATABASE_URL for the in-memory repository', () => {
      const config = loadConfig({ REPOSITORY: 'memory' });

      expect(config.databaseUrl).toBeUndefined();
    });
  });

  describe('invalid values', () => {
    it('fails with a clear message when PORT is not a number', () => {
      expect(() => loadConfig({ PORT: 'abc' })).toThrow(
        'PORT: must be an integer between 1 and 65535',
      );
    });

    it.each([
      ['PORT', 'abc'],
      ['PORT', '3000.5'],
      ['PORT', '80x'],
      ['PORT', '-1'],
      ['PORT', '0'],
      ['PORT', '65536'],
      ['BCRYPT_ROUNDS', '3'],
      ['BCRYPT_ROUNDS', '32'],
      ['VOTE_GRACE_MS', '-1'],
      ['HISTORY_LIMIT', '0'],
      ['NODE_ENV', 'staging'],
      ['REPOSITORY', 'mongo'],
      ['RATE_LIMIT', 'false'],
      ['TRUST_PROXY_HOPS', '-1'],
      ['TRUST_PROXY_HOPS', 'true'],
    ])('rejects %s=%s', (name, value) => {
      expect(() => loadConfig({ [name]: value })).toThrow(name);
    });

    it.each([
      ['PORT', '1', { port: 1 }],
      ['PORT', '65535', { port: 65535 }],
      ['BCRYPT_ROUNDS', '4', { bcryptRounds: 4 }],
      ['BCRYPT_ROUNDS', '31', { bcryptRounds: 31 }],
      ['VOTE_GRACE_MS', '0', { voteGraceMs: 0 }],
      ['HISTORY_LIMIT', '1', { historyLimit: 1 }],
      ['TRUST_PROXY_HOPS', '0', { trustProxyHops: 0 }],
    ])('accepts %s=%s at the limit', (name, value, expected) => {
      expect(loadConfig({ [name]: value })).toMatchObject(expected);
    });

    it('reports every invalid variable in a single error', () => {
      expect(() => loadConfig({ PORT: 'abc', HISTORY_LIMIT: '0' })).toThrow(
        /PORT:.*\n.*HISTORY_LIMIT:/,
      );
    });
  });
});
