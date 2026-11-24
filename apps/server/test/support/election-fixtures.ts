import { addCandidate, addPosition, openElection, type DomainContext } from '@voto/domain';
import type { Election } from '@voto/shared';
import type { ElectionRecord } from '../../src/ports';
import { anElectionRecord, unwrap } from './election-records';

const SOME_MOMENT = new Date('2026-01-01T12:00:00.000Z');

/** Opções de `draftElectionWithPositions`; só o que muda de um teste para outro. */
export interface DraftElectionOptions {
  readonly id: string;
  readonly adminId?: string;
  /** Ids dos cargos, na ordem da fila; o título de cada cargo é o próprio id. */
  readonly positionIds: readonly string[];
}

/** Opções de `openElectionWithVoters`: as do rascunho mais os eleitores. */
export interface OpenElectionOptions extends DraftElectionOptions {
  /** Códigos dos eleitores credenciados; o id de cada eleitor é `<id>:<código>`. */
  readonly voterCodes?: readonly string[];
}

/**
 * Monta, com o domínio real, uma eleição em rascunho só com cargos (sem candidatos nem eleitores).
 *
 * @param options - Id, dono e cargos desejados.
 * @returns Um registro sem histórico, com a eleição em `DRAFT` e versão 0.
 */
export function draftElectionWithPositions(options: DraftElectionOptions): ElectionRecord {
  const { id, adminId, positionIds } = options;
  const draft = anElectionRecord({ id, adminId }).current;
  return { current: positionIds.reduce(withPosition, draft), past: [] };
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
 * Acrescenta um cargo com título igual ao id e desempate `YOUNGEST`.
 *
 * @param election - Eleição em rascunho.
 * @param positionId - Id (e título) do cargo novo.
 * @returns A eleição com o cargo no fim da fila.
 */
function withPosition(election: Election, positionId: string): Election {
  return unwrap(
    addPosition(election, { title: positionId, tiebreak: 'YOUNGEST' }, contextWithId(positionId)),
  );
}

/**
 * Acrescenta um cargo (título = id) e um candidato que concorre só a ele.
 *
 * @param election - Eleição em rascunho.
 * @param positionId - Id do cargo novo.
 * @returns A eleição com o cargo e o candidato.
 */
function withPositionAndCandidate(election: Election, positionId: string): Election {
  const candidate = {
    name: `Candidate for ${positionId}`,
    age: 30,
    remainingMonths: 12,
    applications: [positionId],
    firstChoicePositionId: positionId,
  };
  return unwrap(
    addCandidate(
      withPosition(election, positionId),
      candidate,
      contextWithId(`${positionId}-candidate`),
    ),
  );
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
