import { createElection, createHistory, credentialVoters, type Result } from '@voto/domain';
import type { Election } from '@voto/shared';
import type { ElectionRecord } from '../../src/ports';
import { StubCodeGenerator } from '../doubles/stub-code-generator';

const SOME_MOMENT = new Date('2026-01-01T12:00:00.000Z');

/** Entrega o valor de um `Result` de domínio ou falha o teste na montagem do cenário. */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Test setup failed: ${result.error.code}`);
  return result.value;
}

/** Opções de `anElectionRecord`; só o que muda de um teste para outro. */
export interface ElectionRecordOptions {
  readonly id: string;
  readonly adminId?: string;
  /** Códigos dos eleitores credenciados; o id de cada eleitor é `<id>:<código>`. */
  readonly voterCodes?: readonly string[];
  readonly version?: number;
}

/**
 * Monta um registro de eleição chamando o domínio real (os builders do domínio não são
 * exportados). Os detalhes irrelevantes para o teste (nome, prazo) ficam fixos aqui.
 *
 * @param options - Id, dono, códigos de eleitor e versão desejados.
 * @returns Um registro sem histórico, pronto para o repositório.
 */
export function anElectionRecord(options: ElectionRecordOptions): ElectionRecord {
  const { id, adminId = 'admin-1', voterCodes = [], version = 0 } = options;
  const draft = unwrap(
    createElection({ name: 'Board election', adminId }, { now: SOME_MOMENT, newId: () => id }),
  );
  return createHistory({ ...withVoters(draft, voterCodes), version });
}

/** Credencia um eleitor por código, com id `<eleição>:<código>`, usando o domínio real. */
function withVoters(election: Election, codes: readonly string[]): Election {
  if (codes.length === 0) return election;
  const ids = codes.map((code) => `${election.id}:${code}`);
  const ctx = { now: SOME_MOMENT, newId: () => ids.shift() ?? '' };
  const generator = new StubCodeGenerator(codes);
  return unwrap(credentialVoters(election, { count: codes.length }, generator, ctx)).election;
}
