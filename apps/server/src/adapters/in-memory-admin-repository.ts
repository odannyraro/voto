import type { Admin, AdminRepository } from '../ports';

/** Repositório de admins em memória, para desenvolvimento e testes. */
export class InMemoryAdminRepository implements AdminRepository {
  private readonly admins = new Map<string, Admin>();

  /**
   * Busca um admin pelo nome de usuário.
   *
   * @param username - Nome de usuário exato.
   * @returns Uma cópia do admin, ou `null`.
   */
  findByUsername(username: string): Promise<Admin | null> {
    const found = [...this.admins.values()].find((admin) => admin.username === username);
    return Promise.resolve(found ? { ...found } : null);
  }

  /**
   * Busca um admin pelo id.
   *
   * @param id - Id do admin.
   * @returns Uma cópia do admin, ou `null`.
   */
  findById(id: string): Promise<Admin | null> {
    const found = this.admins.get(id);
    return Promise.resolve(found ? { ...found } : null);
  }

  /**
   * Guarda um admin novo.
   *
   * @param admin - Admin com `id` e `username` ainda não usados.
   * @throws {Error} Se o `id` ou o `username` já existirem.
   */
  async create(admin: Admin): Promise<void> {
    if (this.admins.has(admin.id)) throw new Error(`Admin id ${admin.id} already exists`);
    if (await this.findByUsername(admin.username))
      throw new Error(`Admin username ${admin.username} already exists`);
    this.admins.set(admin.id, { ...admin });
  }
}
