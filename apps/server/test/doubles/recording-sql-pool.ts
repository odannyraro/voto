import type { SqlConnection, SqlExecutor, SqlPool, SqlResult } from '../../src/adapters/pg/sql';

/**
 * Pool SQL que repassa tudo a um pool de verdade (ex.: o `pg-mem`) e anota, em ordem, o texto
 * de cada comando, venha do pool ou de uma conexão reservada. Serve para verificar que um
 * adaptador deixou de mandar um comando caro, quando o estado final do banco é o mesmo.
 */
export class RecordingSqlPool implements SqlPool {
  readonly statements: string[] = [];

  /**
   * @param pool - Pool que executa os comandos de fato.
   */
  constructor(private readonly pool: SqlPool) {}

  /**
   * Anota e executa um comando fora de uma conexão reservada.
   *
   * @param text - Comando SQL.
   * @param values - Valores dos parâmetros.
   * @returns O resultado do pool de verdade.
   */
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<SqlResult<Row>> {
    return this.record<Row>(this.pool, text, values);
  }

  /**
   * Reserva uma conexão do pool de verdade, cujos comandos também são anotados.
   *
   * @returns A conexão, que anota e repassa os comandos.
   */
  async connect(): Promise<SqlConnection> {
    const connection = await this.pool.connect();
    return {
      query: <Row extends Record<string, unknown>>(text: string, values?: unknown[]) =>
        this.record<Row>(connection, text, values),
      release: (destroy?: boolean) => connection.release(destroy),
    };
  }

  /**
   * Anota o comando e o repassa a quem executa.
   *
   * @param executor - Pool ou conexão de verdade.
   * @param text - Comando SQL.
   * @param values - Valores dos parâmetros.
   * @returns O resultado de quem executou.
   */
  private record<Row extends Record<string, unknown>>(
    executor: SqlExecutor,
    text: string,
    values?: unknown[],
  ): Promise<SqlResult<Row>> {
    this.statements.push(text);
    return executor.query<Row>(text, values);
  }
}
