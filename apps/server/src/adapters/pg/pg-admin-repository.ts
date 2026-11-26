import type { Admin, AdminRepository } from '../../ports';
import { adminIdTaken, adminUsernameTaken } from '../repository-errors';
import type { SqlPool } from './sql';

/** Linha da tabela `admins`. */
type AdminRow = { id: string; username: string; password_hash: string };

/** Colunas buscadas na tabela `admins`, na forma de `AdminRow`. */
const SELECT_ADMIN = 'SELECT id, username, password_hash FROM admins';

/** Repositório de admins no PostgreSQL, usado em produção. */
export class PgAdminRepository implements AdminRepository {
  /**
   * @param pool - Pool de um banco já migrado (`migrate`).
   */
  constructor(private readonly pool: SqlPool) {}

  /**
   * Busca um admin pelo nome de usuário.
   *
   * @param username - Nome de usuário exato.
   * @returns O admin, ou `null`.
   */
  findByUsername(username: string): Promise<Admin | null> {
    return this.findOne(`${SELECT_ADMIN} WHERE username = $1`, username);
  }

  /**
   * Busca um admin pelo id.
   *
   * @param id - Id do admin.
   * @returns O admin, ou `null`.
   */
  findById(id: string): Promise<Admin | null> {
    return this.findOne(`${SELECT_ADMIN} WHERE id = $1`, id);
  }

  /**
   * Guarda um admin novo.
   *
   * @param admin - Admin com `id` e `username` ainda não usados.
   * @throws {Error} Se o `id` ou o `username` já existirem.
   */
  async create(admin: Admin): Promise<void> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO admins (id, username, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [admin.id, admin.username, admin.passwordHash],
    );
    if (rowCount !== 0) return;
    // Nada foi inserido: descobre qual das duas restrições barrou, para o erro dizer qual é.
    if (await this.findById(admin.id)) throw adminIdTaken(admin.id);
    throw adminUsernameTaken(admin.username);
  }

  /**
   * Executa uma busca que acha no máximo um admin.
   *
   * @param sql - Consulta com um único parâmetro (`$1`).
   * @param value - Valor do parâmetro.
   * @returns O admin encontrado, ou `null`.
   */
  private async findOne(sql: string, value: string): Promise<Admin | null> {
    const { rows } = await this.pool.query<AdminRow>(sql, [value]);
    const row = rows[0];
    return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
  }
}
