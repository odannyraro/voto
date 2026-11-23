import { describe, expect, it } from 'vitest';
import { SOCKET_EVENTS } from '../src/index';

const ROLE_ACTION_PATTERN = /^[a-z]+:[a-z]+$/;

describe('SOCKET_EVENTS', () => {
  it('gives every event a unique name', () => {
    const names = Object.values(SOCKET_EVENTS);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(Object.entries(SOCKET_EVENTS))('names %s as <role>:<action>', (_key, name) => {
    expect(name).toMatch(ROLE_ACTION_PATTERN);
  });
});
