/** Porta do relógio: regra de negócio nunca lê a hora do sistema diretamente. */
export interface Clock {
  /**
   * Devolve o instante atual.
   *
   * @returns Um `Date` novo com a hora corrente.
   */
  now(): Date;
}
