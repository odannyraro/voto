import { HttpError } from '../http/errors';
import { statusForErrorCode } from '../http/error-status';
import type { ElectionRecord, ElectionRepository, VoterCodeOwner } from '../ports';

/**
 * Repositório de eleições em memória: usado em desenvolvimento (`REPOSITORY=memory`) e como
 * fake nos testes dos serviços. Passa na mesma suíte de contrato do Postgres.
 */
export class InMemoryElectionRepository implements ElectionRepository {
  private readonly records = new Map<string, ElectionRecord>();
  /** Índice código → dono; refeito a cada gravação para refletir só os eleitores atuais. */
  private readonly codeOwners = new Map<string, VoterCodeOwner>();

  /**
   * Busca uma eleição pelo id.
   *
   * @param id - Id da eleição.
   * @returns Uma cópia do registro, ou `null` se não existir.
   */
  get(id: string): Promise<ElectionRecord | null> {
    const record = this.records.get(id);
    return Promise.resolve(record ? structuredClone(record) : null);
  }

  /**
   * Guarda uma eleição nova.
   *
   * @param record - Registro cujo `current.id` ainda não existe.
   * @throws {Error} Se já existir uma eleição com o mesmo id.
   */
  create(record: ElectionRecord): Promise<void> {
    const id = record.current.id;
    if (this.records.has(id)) return Promise.reject(new Error(`Election ${id} already exists`));
    this.store(record);
    return Promise.resolve();
  }

  /**
   * Substitui o registro de uma eleição (controle otimista de concorrência).
   *
   * @param record - Novo registro, com a versão já incrementada pelo serviço.
   * @param expectedVersion - Versão que o chamador leu.
   * @throws {HttpError} `ELECTION_NOT_FOUND` se a eleição não existir; `VERSION_CONFLICT`
   *   se a versão guardada for diferente da esperada.
   */
  save(record: ElectionRecord, expectedVersion: number): Promise<void> {
    const stored = this.records.get(record.current.id);
    if (!stored) return Promise.reject(httpError('ELECTION_NOT_FOUND', 'Election does not exist'));
    if (stored.current.version !== expectedVersion)
      return Promise.reject(httpError('VERSION_CONFLICT', 'Election was changed by someone else'));
    this.store(record);
    return Promise.resolve();
  }

  /**
   * Lista as eleições de um admin.
   *
   * @param adminId - Id do admin dono.
   * @returns Cópias dos registros desse admin.
   */
  listByAdmin(adminId: string): Promise<ElectionRecord[]> {
    const mine = [...this.records.values()].filter((record) => record.current.adminId === adminId);
    return Promise.resolve(structuredClone(mine));
  }

  /**
   * Lista todas as eleições.
   *
   * @returns Cópias de todos os registros.
   */
  listAll(): Promise<ElectionRecord[]> {
    return Promise.resolve(structuredClone([...this.records.values()]));
  }

  /**
   * Acha o eleitor dono de um código.
   *
   * @param code - Código em maiúsculas.
   * @returns A eleição e o eleitor, ou `null`. Códigos revogados continuam achados.
   */
  findByVoterCode(code: string): Promise<VoterCodeOwner | null> {
    return Promise.resolve(this.codeOwners.get(code) ?? null);
  }

  /**
   * Diz se algum eleitor, de qualquer eleição, tem o código.
   *
   * @param code - Código em maiúsculas.
   * @returns `true` se o código está em uso.
   */
  isCodeTaken(code: string): Promise<boolean> {
    return Promise.resolve(this.codeOwners.has(code));
  }

  /** Guarda uma cópia do registro e refaz as entradas do índice dessa eleição. */
  private store(record: ElectionRecord): void {
    const { id, voters } = record.current;
    this.records.set(id, structuredClone(record));
    for (const [code, owner] of this.codeOwners) {
      if (owner.electionId === id) this.codeOwners.delete(code);
    }
    for (const voter of voters) {
      this.codeOwners.set(voter.code, { electionId: id, voterId: voter.id });
    }
  }
}

function httpError(code: 'ELECTION_NOT_FOUND' | 'VERSION_CONFLICT', message: string): HttpError {
  return new HttpError(statusForErrorCode(code), code, message);
}
