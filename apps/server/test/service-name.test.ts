import { describe, expect, it } from 'vitest';
import { SERVICE_NAME } from '../src/index';

describe('server package', () => {
  it('identifies the service in logs and health checks', () => {
    expect(SERVICE_NAME).toBe('voto-server');
  });
});
