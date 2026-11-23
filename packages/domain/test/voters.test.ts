import { describe, expect, it } from 'vitest';
import { credentialVoters, revokeVoter } from '../src/index';
import { anElection, aVoter } from './builders/election-builder';
import { fixedContext, sequenceCodeGenerator } from './builders/fixed-context';

const MAX_VOTERS_PER_BATCH = 500;

describe('credentialVoters', () => {
  it('credentials one voter per generated code and returns the codes', () => {
    const election = anElection().build();
    const codes = sequenceCodeGenerator(['AAAA2222', 'BBBB3333']);

    const result = credentialVoters(election, { count: 2 }, codes, fixedContext());

    expect(result).toMatchObject({
      ok: true,
      value: {
        codes: ['AAAA2222', 'BBBB3333'],
        election: {
          voters: [
            { id: 'id-1', code: 'AAAA2222', status: 'CREDENTIALED' },
            { id: 'id-2', code: 'BBBB3333', status: 'CREDENTIALED' },
          ],
        },
      },
    });
  });

  it('gives the labels to the new voters in order', () => {
    const election = anElection().build();
    const codes = sequenceCodeGenerator(['AAAA2222', 'BBBB3333']);

    const result = credentialVoters(
      election,
      { count: 2, labels: ['Table 1', 'Table 2'] },
      codes,
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { election: { voters: [{ label: 'Table 1' }, { label: 'Table 2' }] } },
    });
  });

  it('keeps the voters credentialed before', () => {
    const election = anElection()
      .open()
      .withVoters(aVoter({ id: 'voter-1', code: 'OLDC0DE2' }))
      .build();

    const result = credentialVoters(
      election,
      { count: 1 },
      sequenceCodeGenerator(['NEWC0DE3']),
      fixedContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { election: { voters: [{ code: 'OLDC0DE2' }, { code: 'NEWC0DE3' }] } },
    });
  });

  it.each([0, MAX_VOTERS_PER_BATCH + 1, 1.5])('rejects a batch of %s voters', (count) => {
    const election = anElection().build();

    const result = credentialVoters(election, { count }, sequenceCodeGenerator([]), fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_VOTER_COUNT' } });
  });

  it('rejects more labels than voters', () => {
    const election = anElection().build();

    const result = credentialVoters(
      election,
      { count: 1, labels: ['Table 1', 'Table 2'] },
      sequenceCodeGenerator(['AAAA2222']),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_VOTER_LABELS' } });
  });

  it('rejects a generated code that another voter already has', () => {
    const election = anElection()
      .withVoters(aVoter({ code: 'AAAA2222' }))
      .build();

    const result = credentialVoters(
      election,
      { count: 1 },
      sequenceCodeGenerator(['AAAA2222']),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_VOTER_CODE' } });
  });

  it('rejects a generated code repeated in the same batch', () => {
    const election = anElection().build();

    const result = credentialVoters(
      election,
      { count: 2 },
      sequenceCodeGenerator(['AAAA2222', 'AAAA2222']),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_VOTER_CODE' } });
  });

  it('rejects new voters after the election is finished', () => {
    const election = anElection().withStatus('FINISHED').build();

    const result = credentialVoters(
      election,
      { count: 1 },
      sequenceCodeGenerator(['AAAA2222']),
      fixedContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });
});

describe('revokeVoter', () => {
  it('revokes the code of a credentialed voter', () => {
    const election = anElection()
      .withVoters(aVoter({ id: 'voter-1' }))
      .build();

    const result = revokeVoter(election, 'voter-1');

    expect(result).toMatchObject({
      ok: true,
      value: { voters: [{ id: 'voter-1', status: 'REVOKED' }] },
    });
  });

  it('rejects an unknown voter', () => {
    const election = anElection().build();

    const result = revokeVoter(election, 'ghost');

    expect(result).toMatchObject({ ok: false, error: { code: 'VOTER_NOT_FOUND' } });
  });

  it('rejects revoking a voter twice', () => {
    const election = anElection()
      .withVoters(aVoter({ id: 'voter-1', status: 'REVOKED' }))
      .build();

    const result = revokeVoter(election, 'voter-1');

    expect(result).toMatchObject({ ok: false, error: { code: 'VOTER_REVOKED' } });
  });
});
