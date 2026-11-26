import type { SqlExecutor } from './sql';

// architecture.md §13: a eleição inteira (com o histórico do desfazer) fica numa coluna
// JSONB; as demais colunas existem para filtrar, ordenar e controlar a concorrência.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  )`,
  // `creation_order` é preenchida pelo banco no `INSERT` e dá a ordem das listagens: sem
  // ela, o Postgres devolve as linhas numa ordem que muda a cada `UPDATE`.
  `CREATE TABLE IF NOT EXISTS elections (
    id TEXT PRIMARY KEY,
    creation_order SERIAL,
    admin_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    record JSONB NOT NULL
  )`,
  // A chave primária garante o código único entre todas as eleições (o eleitor entra só com ele).
  `CREATE TABLE IF NOT EXISTS voter_codes (
    code TEXT PRIMARY KEY,
    election_id TEXT NOT NULL,
    voter_id TEXT NOT NULL
  )`,
];

/**
 * Cria as tabelas que faltam no banco. Roda a cada inicialização do servidor: num banco já
 * migrado não muda nada.
 *
 * @param database - Pool ou conexão onde as tabelas são criadas.
 */
export async function migrate(database: SqlExecutor): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await database.query(statement);
  }
}
