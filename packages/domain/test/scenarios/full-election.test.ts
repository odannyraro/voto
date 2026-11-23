import { describe, expect, it } from 'vitest';
import {
  addCandidate,
  addPosition,
  applyOrder,
  castVote,
  createElection,
  credentialVoters,
  finishElection,
  nextPositionStatus,
  openElection,
  openRound,
  openRunoff,
  releaseResults,
  suggestOrder,
  voterView,
  type DomainContext,
  type Election,
} from '../../src/index';
import { fixedContext, sequenceCodeGenerator } from '../builders/fixed-context';
import { valueOf } from '../builders/result-helpers';

// Cenário de ponta a ponta só pela API pública: dois cargos, 2º turno e exclusão do eleito.
// Desempate de President: OLDEST (Ana 30 > Bia 25 > Caio 20).

/**
 * Id de um cargo pelo título, para o teste não depender da ordem dos ids gerados.
 *
 * @param election - Eleição atual.
 * @param title - Título do cargo.
 * @returns O id do cargo.
 */
function positionId(election: Election, title: string): string {
  return election.positions.find((position) => position.title === title)?.id ?? 'missing';
}

/**
 * Id de um candidato pelo nome.
 *
 * @param election - Eleição atual.
 * @param name - Nome do candidato.
 * @returns O id do candidato.
 */
function candidateId(election: Election, name: string): string {
  return election.candidates.find((candidate) => candidate.name === name)?.id ?? 'missing';
}

/**
 * Ids dos três eleitores credenciados.
 *
 * @param election - Eleição atual.
 * @returns Os ids, na ordem de credenciamento.
 */
function voterIds(election: Election): [string, string, string] {
  const [first = '', second = '', third = ''] = election.voters.map((voter) => voter.id);
  return [first, second, third];
}

/**
 * Faz os três eleitores votarem na rodada aberta, nos candidatos indicados por nome.
 *
 * @param election - Eleição com rodada aberta.
 * @param names - Escolha de cada eleitor, na ordem dos eleitores.
 * @param ctx - Contexto do comando.
 * @returns A eleição depois dos três votos (a rodada fecha sozinha no último).
 */
function everyoneVotes(
  election: Election,
  names: [string, string, string],
  ctx: DomainContext,
): Election {
  const roundId = election.rounds.at(-1)?.id ?? 'missing';
  return voterIds(election).reduce(
    (current, voterId, index) =>
      valueOf(
        castVote(
          current,
          { roundId, voterId, choice: candidateId(current, names[index] ?? '') },
          ctx,
        ),
      ),
    election,
  );
}

/**
 * Configura e abre a eleição: President (Ana, Bia, Caio) e Treasurer (Ana, Caio, Duda),
 * com três eleitores credenciados.
 *
 * @param ctx - Contexto do comando.
 * @returns A eleição aberta.
 */
function openedElection(ctx: DomainContext): Election {
  let election = valueOf(createElection({ adminId: 'admin-1', name: 'Student Union 2027' }, ctx));
  election = valueOf(addPosition(election, { title: 'President', tiebreak: 'OLDEST' }, ctx));
  election = valueOf(addPosition(election, { title: 'Treasurer', tiebreak: 'YOUNGEST' }, ctx));
  const president = positionId(election, 'President');
  const treasurer = positionId(election, 'Treasurer');

  election = valueOf(
    addCandidate(
      election,
      {
        name: 'Ana',
        age: 30,
        remainingMonths: 12,
        applications: [president, treasurer],
        firstChoicePositionId: president,
      },
      ctx,
    ),
  );
  election = valueOf(
    addCandidate(
      election,
      {
        name: 'Bia',
        age: 25,
        remainingMonths: 24,
        applications: [president],
        firstChoicePositionId: president,
      },
      ctx,
    ),
  );
  election = valueOf(
    addCandidate(
      election,
      {
        name: 'Caio',
        age: 20,
        remainingMonths: 36,
        applications: [president, treasurer],
        firstChoicePositionId: treasurer,
      },
      ctx,
    ),
  );
  election = valueOf(
    addCandidate(
      election,
      {
        name: 'Duda',
        age: 22,
        remainingMonths: 30,
        applications: [treasurer],
        firstChoicePositionId: treasurer,
      },
      ctx,
    ),
  );

  const codes = sequenceCodeGenerator(['AAAA2222', 'BBBB3333', 'CCCC4444']);
  election = valueOf(credentialVoters(election, { count: 3 }, codes, ctx)).election;
  return valueOf(openElection(election));
}

/**
 * Leva a eleição até President decidido: 1º turno empatado em três, 2º turno Ana × Bia.
 *
 * @param ctx - Contexto do comando.
 * @returns A eleição com President decidido e resultado liberado.
 */
function electPresident(ctx: DomainContext): Election {
  let election = openedElection(ctx);
  election = valueOf(applyOrder(election, suggestOrder(election)));
  const president = positionId(election, 'President');

  election = valueOf(openRound(election, { positionId: president }, ctx));
  election = everyoneVotes(election, ['Ana', 'Bia', 'Caio'], ctx);
  election = valueOf(openRunoff(election, { positionId: president }, ctx));
  election = everyoneVotes(election, ['Ana', 'Ana', 'Bia'], ctx);
  return valueOf(releaseResults(election, election.rounds.at(-1)?.id ?? 'missing'));
}

describe('a full election through the public API', () => {
  it('elects the president in a runoff and shows the released result to the voters', () => {
    const ctx = fixedContext();

    const election = electPresident(ctx);

    expect(voterView(election, voterIds(election)[0])).toMatchObject({
      phase: 'RESULTS',
      result: {
        positionTitle: 'President',
        kind: 'RUNOFF',
        electedCandidateId: candidateId(election, 'Ana'),
      },
    });
  });

  it('moves on to the treasurer once the president is decided', () => {
    const election = electPresident(fixedContext());

    const next = nextPositionStatus(election);

    expect(next).toEqual({ status: 'READY', positionId: positionId(election, 'Treasurer') });
  });

  it('keeps the elected president off the treasurer ballot', () => {
    const ctx = fixedContext();
    const election = electPresident(ctx);

    const withTreasurerRound = valueOf(
      openRound(election, { positionId: positionId(election, 'Treasurer') }, ctx),
    );

    expect(withTreasurerRound.rounds.at(-1)?.candidateIds).toEqual([
      candidateId(election, 'Caio'),
      candidateId(election, 'Duda'),
    ]);
  });

  it('finishes with every position decided', () => {
    const ctx = fixedContext();
    let election = electPresident(ctx);

    election = valueOf(openRound(election, { positionId: positionId(election, 'Treasurer') }, ctx));
    election = everyoneVotes(election, ['Caio', 'Caio', 'Duda'], ctx);
    election = valueOf(finishElection(election));

    expect(election.positions).toMatchObject([
      { title: 'President', status: 'DECIDED', electedCandidateId: candidateId(election, 'Ana') },
      { title: 'Treasurer', status: 'DECIDED', electedCandidateId: candidateId(election, 'Caio') },
    ]);
  });
});
