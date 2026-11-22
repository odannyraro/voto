import { describe, expect, it } from 'vitest';
import { credentialVoters, finishElection } from '../src/index';
import { anElection, aPosition, aRound } from './builders/election-builder';
import { fixedContext, sequenceCodeGenerator } from './builders/fixed-context';
import { valueOf } from './builders/result-helpers';

describe('finishElection', () => {
  it('finishes an open election with no round in progress', () => {
    const election = anElection().open().withPositions(aPosition({ status: 'DECIDED', electedCandidateId: 'ana' })).build();

    const result = finishElection(election);

    expect(result).toMatchObject({ ok: true, value: { status: 'FINISHED' } });
  });

  it('rejects finishing while a round is still open', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ status: 'VOTING' }))
      .withRounds(aRound({ status: 'OPEN' }))
      .build();

    const result = finishElection(election);

    expect(result).toMatchObject({ ok: false, error: { code: 'ROUND_IN_PROGRESS' } });
  });

  it('rejects finishing an election that was never opened', () => {
    const election = anElection().withPositions(aPosition()).build();

    const result = finishElection(election);

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_NOT_OPEN' } });
  });

  it('blocks any further change once the election is finished', () => {
    const finished = valueOf(finishElection(anElection().open().withPositions(aPosition()).build()));

    const result = credentialVoters(finished, { count: 1 }, sequenceCodeGenerator(['AAAA2222']), fixedContext());

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });
});
