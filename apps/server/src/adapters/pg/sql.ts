// O pedaço do `pg` que os adaptadores usam, declarado como interface nossa: o `Pool` do
// `pg` a satisfaz sem adaptação, e os testes podem substituí-lo na fronteira.

/** Resultado de um comando SQL, só com o que os adaptadores leem. */
export interface SqlResult<Row> {
  readonly rows: Row[];
  /** Linhas afetadas por um `INSERT`, `UPDATE` ou `DELETE`. */
  readonly rowCount: number | null;
}

/** Quem executa SQL parametrizado: o pool inteiro ou uma conexão dele. */
export interface SqlExecutor {
  /**
   * Executa um comando SQL.
   *
   * @param text - Comando com parâmetros posicionais (`$1`, `$2`...).
   * @param values - Valores dos parâmetros, na ordem.
   * @returns As linhas lidas e a quantidade de linhas afetadas.
   */
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<SqlResult<Row>>;
}

/** Conexão reservada para um uso exclusivo, como uma transação. */
export interface SqlConnection extends SqlExecutor {
  /**
   * Devolve a conexão ao pool.
   *
   * @param destroy - `true` descarta a conexão em vez de reaproveitá-la (estado duvidoso).
   */
  release(destroy?: boolean): void;
}

/** Conjunto de conexões com o banco. */
export interface SqlPool extends SqlExecutor {
  /**
   * Reserva uma conexão; quem reserva precisa liberá-la.
   *
   * @returns A conexão reservada.
   */
  connect(): Promise<SqlConnection>;
}
