import { describe, expect, it } from 'vitest';
import { suggestOrder } from '../src/index';
import { aCandidate, anElection, aPosition } from './builders/election-builder';

const president = aPosition({ id: 'president', title: 'President' });
const treasurer = aPosition({ id: 'treasurer', title: 'Treasurer' });
const secretary = aPosition({ id: 'secretary', title: 'Secretary' });

describe('suggestOrder', () => {
  it('puts first the position whose candidates also run for more pending positions', () => {
    const election = anElection()
      .open()
      .withPositions(president, treasurer, secretary)
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president', 'treasurer'] }),
        aCandidate({ id: 'bia', applications: ['president', 'secretary'] }),
        aCandidate({ id: 'caio', applications: ['secretary'] }),
        aCandidate({ id: 'duda', applications: ['treasurer'] }),
      )
      .withQueue('secretary', 'treasurer', 'president')
      .build();

    const order = suggestOrder(election);

    expect(order).toEqual(['president', 'secretary', 'treasurer']);
  });

  it('puts the position with more eligible candidates first when conflicts tie', () => {
    const election = anElection()
      .open()
      .withPositions(president, treasurer)
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president'] }),
        aCandidate({ id: 'bia', applications: ['president'] }),
        aCandidate({ id: 'caio', applications: ['treasurer'] }),
        aCandidate({ id: 'duda', applications: ['treasurer'] }),
        aCandidate({ id: 'eva', applications: ['treasurer'] }),
      )
      .build();

    const order = suggestOrder(election);

    expect(order).toEqual(['treasurer', 'president']);
  });

  it('puts the position chosen as first option by more candidates first when the rest ties', () => {
    // Secretary já foi decidido: candidatar-se a ele não gera conflito com cargos pendentes.
    const election = anElection()
      .open()
      .withPositions(
        president,
        treasurer,
        aPosition({ ...secretary, status: 'DECIDED', electedCandidateId: 'zeca' }),
      )
      .withCandidates(
        aCandidate({
          id: 'ana',
          applications: ['president', 'secretary'],
          firstChoicePositionId: 'secretary',
        }),
        aCandidate({ id: 'bia', applications: ['president'] }),
        aCandidate({ id: 'caio', applications: ['treasurer'] }),
        aCandidate({ id: 'duda', applications: ['treasurer'] }),
        aCandidate({ id: 'zeca', applications: ['secretary'] }),
      )
      .build();

    const order = suggestOrder(election);

    expect(order).toEqual(['treasurer', 'president']);
  });

  it('sends positions with fewer than two eligible candidates to the end', () => {
    const election = anElection()
      .open()
      .withPositions(president, treasurer, secretary)
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president', 'secretary'] }),
        aCandidate({ id: 'bia', applications: ['treasurer'] }),
        aCandidate({ id: 'caio', applications: ['treasurer'] }),
        aCandidate({ id: 'duda', applications: ['secretary'] }),
      )
      .withQueue('president', 'treasurer', 'secretary')
      .build();

    const order = suggestOrder(election);

    expect(order).toEqual(['secretary', 'treasurer', 'president']);
  });

  it('keeps the current queue order when every criterion ties', () => {
    const election = anElection()
      .open()
      .withPositions(president, treasurer, secretary)
      .withCandidates(
        aCandidate({ id: 'ana', applications: ['president'] }),
        aCandidate({ id: 'bia', applications: ['president'] }),
        aCandidate({ id: 'caio', applications: ['treasurer'] }),
        aCandidate({ id: 'duda', applications: ['treasurer'] }),
        aCandidate({ id: 'eva', applications: ['secretary'] }),
        aCandidate({ id: 'fabi', applications: ['secretary'] }),
      )
      .withQueue('secretary', 'president', 'treasurer')
      .build();

    const order = suggestOrder(election);

    expect(order).toEqual(['secretary', 'president', 'treasurer']);
  });
});
