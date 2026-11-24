import { addCandidate, addPosition, openElection, type DomainContext } from '@voto/domain';
import type { Election } from '@voto/shared';
import type { ElectionRecord } from '../../src/ports';
import { anElectionRecord, unwrap } from './election-records';

const SOME_MOMENT = new Date('2026-01-01T12:00:00.000Z');

/** Opções de `openElectionWithVoters`; só o que muda de um teste para outro. */
export interface OpenElectionOptions {
  readonly id: string;
  readonly adminId?: string;
  /** Ids dos cargos, na ordem da fila; o título de cada cargo é o próprio id. */
  readonly positionIds: readonly string[];
  /** Códigos dos eleitores credenciados; o id de cada eleitor é `<id>:<código>`. */
  readonly voterCodes?: readonly string[];
}

/**
 * Monta, com o domínio real, uma eleição já aberta e pronta para abrir rodadas: cada
 * cargo tem um candidato (id `<cargo>-candidate`) e há eleitores credenciados.
 *
 * @param options - Id, dono, cargos e códigos de eleitor desejados.
 * @returns Um registro sem histórico, com a eleição em `OPEN` e versão 0.
 */
export function openElectionWithVoters(options: OpenElectionOptions): ElectionRecord {
  const { id, adminId, positionIds, voterCodes = ['VOTER1'] } = options;
  const draft = anElectionRecord({ id, adminId, voterCodes }).current;
  const withPositions = positionIds.reduce(withPositionAndCandidate, draft);
  return { current: unwrap(openElection(withPositions)), past: [] };
}

/**
 * Acrescenta um cargo (título = id) e um candidato que concorre só a ele.
 *
 * @param election - Eleição em rascunho.
 * @param positionId - Id do cargo novo.
 * @returns A eleição com o cargo e o candidato.
 */
function withPositionAndCandidate(election: Election, positionId: string): Election {
  const withPosition = unwrap(
    addPosition(election, { title: positionId, tiebreak: 'YOUNGEST' }, contextWithId(positionId)),
  );
  const candidate = {
    name: `Candidate for ${positionId}`,
    age: 30,
    remainingMonths: 12,
    applications: [positionId],
    firstChoicePositionId: positionId,
  };
  return unwrap(addCandidate(withPosition, candidate, contextWithId(`${positionId}-candidate`)));
}

/**
 * Cria um contexto de domínio que entrega sempre o mesmo id, para o cenário ter ids previsíveis.
 *
 * @param id - Id que o comando vai receber.
 * @returns O contexto com um instante fixo.
 */
function contextWithId(id: string): DomainContext {
  return { now: SOME_MOMENT, newId: () => id };
}
