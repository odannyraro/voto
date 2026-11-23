import { describe, expect, it } from 'vitest';
import { applyOrder, nextPositionStatus } from '../src/index';
import { aCandidate, anElection, aPosition, aRound } from './builders/election-builder';

const president = aPosition({ id: 'president', title: 'President' });
const treasurer = aPosition({ id: 'treasurer', title: 'Treasurer' });

describe('nextPositionStatus', () => {
  it('points to the position at the top of the queue when it has candidates', () => {
    const election = anElection()
      .open()
      .withPositions(president, treasurer)
      .withCandidates(aCandidate({ id: 'ana', applications: ['treasurer'] }))
      .withQueue('treasurer', 'president')
      .build();

    const next = nextPositionStatus(election);

    expect(next).toEqual({ status: 'READY', positionId: 'treasurer' });
  });

  it('warns about a position without eligible candidates and lists who can be attached', () => {
    const election = anElection()
      .open()
      .withPositions(
        aPosition({ ...president, status: 'DECIDED', electedCandidateId: 'ana' }),
        treasurer,
      )
      .withCandidates(
        aCandidate({ id: 'ana', name: 'Ana', applications: ['president', 'treasurer'] }),
        aCandidate({ id: 'bia', name: 'Bia', applications: ['president'] }),
      )
      .withQueue('treasurer')
      .build();

    const next = nextPositionStatus(election);

    expect(next).toEqual({
      status: 'INSUFFICIENT_CANDIDATES',
      positionId: 'treasurer',
      attachableCandidates: [{ id: 'bia', name: 'Bia' }],
    });
  });

  it('reports that nothing is left when the queue is empty', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...president, status: 'DECIDED' }))
      .build();

    const next = nextPositionStatus(election);

    expect(next).toEqual({ status: 'NONE_LEFT' });
  });

  it('reports the round in progress while one is open', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...president, status: 'VOTING' }), treasurer)
      .withRounds(aRound({ positionId: 'president', status: 'OPEN' }))
      .build();

    const next = nextPositionStatus(election);

    expect(next).toEqual({ status: 'ROUND_IN_PROGRESS', positionId: 'president' });
  });

  it('points to the position waiting for a runoff before anything else', () => {
    const election = anElection()
      .open()
      .withPositions(aPosition({ ...president, status: 'AWAITING_RUNOFF' }), treasurer)
      .build();

    const next = nextPositionStatus(election);

    expect(next).toEqual({ status: 'AWAITING_RUNOFF', positionId: 'president' });
  });
});

describe('applyOrder', () => {
  it('replaces the voting queue with the order chosen by the admin', () => {
    const election = anElection().withPositions(president, treasurer).build();

    const result = applyOrder(election, ['treasurer', 'president']);

    expect(result).toMatchObject({ ok: true, value: { queue: ['treasurer', 'president'] } });
  });

  it.each([
    { label: 'leaves a position out', order: ['treasurer'] },
    { label: 'repeats a position', order: ['treasurer', 'treasurer'] },
    {
      label: 'includes a position that is not in the queue',
      order: ['treasurer', 'president', 'ghost'],
    },
  ])('rejects an order that $label', ({ order }) => {
    const election = anElection().withPositions(president, treasurer).build();

    const result = applyOrder(election, order);

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_QUEUE_ORDER' } });
  });

  it('rejects reordering a finished election', () => {
    const election = anElection()
      .withStatus('FINISHED')
      .withPositions(president, treasurer)
      .build();

    const result = applyOrder(election, ['treasurer', 'president']);

    expect(result).toMatchObject({ ok: false, error: { code: 'ELECTION_FINISHED' } });
  });
});
