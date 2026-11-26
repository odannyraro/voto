import type { SqlExecutor, SqlPool } from './sql';

/**
 * Executa um trabalho numa transação: tudo o que ele escrever é gravado junto, ou nada é.
 * Usa uma única conexão, que sempre volta ao pool (ou é descartada se nem o `ROLLBACK`
 * funcionar, para ninguém herdar uma transação pela metade).
 *
 * @param pool - Pool de onde a conexão é reservada.
 * @param work - Trabalho a executar; só deve usar o `tx` recebido.
 * @returns O que o trabalho devolver, depois do `COMMIT`.
 * @throws {Error} O erro do trabalho (ou do `BEGIN`/`COMMIT`), depois de desfazer as escritas.
 */
export async function inTransaction<T>(
  pool: SqlPool,
  work: (tx: SqlExecutor) => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  let broken = false;
  try {
    await connection.query('BEGIN');
    const value = await work(connection);
    await connection.query('COMMIT');
    return value;
  } catch (error) {
    // A falha do rollback não pode esconder o erro original, que é o que explica o problema.
    await connection.query('ROLLBACK').catch(() => {
      broken = true;
    });
    throw error;
  } finally {
    connection.release(broken);
  }
}
