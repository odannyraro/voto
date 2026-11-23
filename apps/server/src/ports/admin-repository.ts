/** Administrador que cria e conduz eleições. */
export interface Admin {
  readonly id: string;
  readonly username: string;
  /** Hash bcrypt; a senha em texto puro nunca é guardada. */
  readonly passwordHash: string;
}

/** Porta de persistência dos administradores. */
export interface AdminRepository {
  /**
   * Busca um admin pelo nome de usuário.
   *
   * @param username - Nome de usuário exato.
   * @returns O admin, ou `null` se não existir.
   */
  findByUsername(username: string): Promise<Admin | null>;

  /**
   * Busca um admin pelo id.
   *
   * @param id - Id do admin.
   * @returns O admin, ou `null` se não existir.
   */
  findById(id: string): Promise<Admin | null>;

  /**
   * Guarda um admin novo.
   *
   * @param admin - Admin cujo `username` e `id` ainda não existem.
   * @throws {Error} Se já existir um admin com o mesmo `id` ou o mesmo `username`.
   */
  create(admin: Admin): Promise<void>;
}
