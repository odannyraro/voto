import type { Election } from '@voto/shared';
import type { History } from '@voto/domain';

/**
 * O que o servidor guarda de cada eleição: o estado atual e os anteriores, para o
 * "desfazer" sobreviver a reinícios (architecture.md §5.4).
 */
export type ElectionRecord = History<Election>;

/** Dono de um código de eleitor: a eleição e o eleitor a que o código dá acesso. */
export interface VoterCodeOwner {
  readonly electionId: string;
  readonly voterId: string;
}

/**
 * Porta de persistência das eleições. Toda implementação (memória, Postgres) passa na
 * mesma suíte de contrato. Os registros devolvidos são cópias: alterá-los não muda o
 * que está guardado.
 */
export interface ElectionRepository {
  /**
   * Busca uma eleição pelo id.
   *
   * @param id - Id da eleição.
   * @returns O registro, ou `null` se não existir.
   */
  get(id: string): Promise<ElectionRecord | null>;

  /**
   * Guarda uma eleição nova.
   *
   * @param record - Registro cujo `current.id` ainda não existe.
   */
  create(record: ElectionRecord): Promise<void>;

  /**
   * Substitui o registro de uma eleição já existente (controle otimista de concorrência).
   *
   * @param record - Novo registro, com `current.version` já incrementada pelo serviço.
   * @param expectedVersion - Versão que o chamador leu; precisa ser a guardada.
   * @throws {HttpError} `VERSION_CONFLICT` se a versão guardada for outra.
   */
  save(record: ElectionRecord, expectedVersion: number): Promise<void>;

  /**
   * Lista as eleições de um admin.
   *
   * @param adminId - Id do admin dono.
   * @returns Os registros desse admin; vazio se não tiver nenhum.
   */
  listByAdmin(adminId: string): Promise<ElectionRecord[]>;

  /**
   * Lista todas as eleições (usado ao reiniciar o servidor para reagendar prazos).
   *
   * @returns Todos os registros guardados.
   */
  listAll(): Promise<ElectionRecord[]>;

  /**
   * Acha o eleitor dono de um código (o eleitor entra só com o código).
   *
   * @param code - Código já normalizado em maiúsculas.
   * @returns A eleição e o eleitor, ou `null` se o código não existir.
   */
  findByVoterCode(code: string): Promise<VoterCodeOwner | null>;

  /**
   * Diz se um código já pertence a algum eleitor de qualquer eleição.
   *
   * @param code - Código já normalizado em maiúsculas.
   * @returns `true` se o código está em uso.
   */
  isCodeTaken(code: string): Promise<boolean>;
}
