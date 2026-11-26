import type { Election } from '@voto/shared';
import type { ElectionRecord, ElectionRepository, VoterCodeOwner } from '../../ports';
import { electionAlreadyExists, electionNotFound, versionConflict } from '../repository-errors';
import type { SqlExecutor, SqlPool } from './sql';
import { inTransaction } from './transaction';

/** Linha com o registro guardado em JSONB; o `pg` já a devolve convertida em objeto. */
type RecordRow = { record: ElectionRecord };

/** Linha da tabela `voter_codes` com o dono do código. */
type VoterCodeRow = { election_id: string; voter_id: string };

/** Parâmetros de cada eleitor no `INSERT` de códigos: código, eleição e eleitor. */
const PARAMS_PER_CODE = 3;

/**
 * Repositório de eleições no PostgreSQL, usado em produção: uma linha por eleição, com o
 * registro inteiro em JSONB, e uma tabela de códigos de eleitor. Passa na mesma suíte de
 * contrato do repositório em memória.
 */
export class PgElectionRepository implements ElectionRepository {
  /**
   * @param pool - Pool de um banco já migrado (`migrate`).
   */
  constructor(private readonly pool: SqlPool) {}

  /**
   * Busca uma eleição pelo id.
   *
   * @param id - Id da eleição.
   * @returns O registro com o histórico, ou `null` se não existir.
   */
  async get(id: string): Promise<ElectionRecord | null> {
    const { rows } = await this.pool.query<RecordRow>(
      'SELECT record FROM elections WHERE id = $1',
      [id],
    );
    return rows[0]?.record ?? null;
  }

  /**
   * Guarda uma eleição nova e os códigos dos seus eleitores, tudo ou nada.
   *
   * @param record - Registro cujo `current.id` ainda não existe.
   * @throws {Error} Se já existir uma eleição com o mesmo id, ou se um código já pertencer a
   *   outra eleição (violação da chave primária de `voter_codes`).
   */
  create(record: ElectionRecord): Promise<void> {
    const { id, adminId, version } = record.current;
    return inTransaction(this.pool, async (tx) => {
      // Sem alvo no `ON CONFLICT`: a única restrição da tabela é a chave primária, e o
      // pg-mem (usado nos testes) conta as linhas errado quando o alvo é informado.
      const { rowCount } = await tx.query(
        `INSERT INTO elections (id, admin_id, version, record) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [id, adminId, version, JSON.stringify(record)],
      );
      if (rowCount === 0) throw electionAlreadyExists(id);
      await replaceVoterCodes(tx, record.current);
    });
  }

  /**
   * Substitui o registro de uma eleição e os seus códigos, tudo ou nada (controle otimista
   * de concorrência).
   *
   * @param record - Novo registro, com a versão já incrementada pelo serviço.
   * @param expectedVersion - Versão que o chamador leu.
   * @throws {HttpError} `ELECTION_NOT_FOUND` se a eleição não existir; `VERSION_CONFLICT`
   *   se a versão guardada for diferente da esperada.
   * @throws {Error} Se um código já pertencer a outra eleição.
   */
  save(record: ElectionRecord, expectedVersion: number): Promise<void> {
    const { id, version } = record.current;
    return inTransaction(this.pool, async (tx) => {
      // A versão no `WHERE` faz a conferência e a gravação numa operação só: de duas
      // gravações simultâneas, o banco deixa passar apenas uma.
      const { rowCount } = await tx.query(
        'UPDATE elections SET version = $1, record = $2 WHERE id = $3 AND version = $4',
        [version, JSON.stringify(record), id, expectedVersion],
      );
      if (rowCount === 0) throw await rejectedSaveError(tx, id);
      await replaceVoterCodes(tx, record.current);
    });
  }

  /**
   * Lista as eleições de um admin.
   *
   * @param adminId - Id do admin dono.
   * @returns Os registros desse admin, sem ordem garantida.
   */
  async listByAdmin(adminId: string): Promise<ElectionRecord[]> {
    const { rows } = await this.pool.query<RecordRow>(
      'SELECT record FROM elections WHERE admin_id = $1',
      [adminId],
    );
    return rows.map((row) => row.record);
  }

  /**
   * Lista todas as eleições.
   *
   * @returns Todos os registros, sem ordem garantida.
   */
  async listAll(): Promise<ElectionRecord[]> {
    const { rows } = await this.pool.query<RecordRow>('SELECT record FROM elections');
    return rows.map((row) => row.record);
  }

  /**
   * Acha o eleitor dono de um código.
   *
   * @param code - Código em maiúsculas.
   * @returns A eleição e o eleitor, ou `null`. Códigos revogados continuam achados.
   */
  async findByVoterCode(code: string): Promise<VoterCodeOwner | null> {
    const { rows } = await this.pool.query<VoterCodeRow>(
      'SELECT election_id, voter_id FROM voter_codes WHERE code = $1',
      [code],
    );
    const row = rows[0];
    return row ? { electionId: row.election_id, voterId: row.voter_id } : null;
  }

  /**
   * Diz se algum eleitor, de qualquer eleição, tem o código.
   *
   * @param code - Código em maiúsculas.
   * @returns `true` se o código está em uso.
   */
  async isCodeTaken(code: string): Promise<boolean> {
    return (await this.findByVoterCode(code)) !== null;
  }
}

/**
 * Explica por que um `UPDATE` de eleição não afetou nenhuma linha.
 *
 * @param tx - Transação do `save` recusado.
 * @param id - Id da eleição que se tentou gravar.
 * @returns O erro a lançar: `ELECTION_NOT_FOUND` se a eleição não existe; senão
 *   `VERSION_CONFLICT`.
 */
async function rejectedSaveError(tx: SqlExecutor, id: string): Promise<Error> {
  const { rows } = await tx.query('SELECT id FROM elections WHERE id = $1', [id]);
  return rows.length === 0 ? electionNotFound() : versionConflict();
}

/**
 * Reescreve os códigos de uma eleição, para que eleitores removidos (ex.: credenciamento
 * desfeito) liberem os seus.
 *
 * @param tx - Transação que está gravando a eleição.
 * @param election - Estado atual da eleição.
 */
async function replaceVoterCodes(tx: SqlExecutor, election: Election): Promise<void> {
  await tx.query('DELETE FROM voter_codes WHERE election_id = $1', [election.id]);
  if (election.voters.length === 0) return;

  // Um único `INSERT` com todas as linhas: um por eleitor custaria centenas de idas ao banco.
  const rows = election.voters.map((_voter, index) => {
    const first = index * PARAMS_PER_CODE + 1;
    return `($${first}, $${first + 1}, $${first + 2})`;
  });
  await tx.query(
    `INSERT INTO voter_codes (code, election_id, voter_id) VALUES ${rows.join(', ')}`,
    election.voters.flatMap((voter) => [voter.code, election.id, voter.id]),
  );
}
