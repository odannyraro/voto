import type { SqlConnection, SqlPool, SqlResult } from '../../src/adapters/pg/sql';

const NOTHING = { rows: [], rowCount: 0 };

/**
 * Pool SQL falso que anota, em ordem, o que foi pedido: cada comando de uma conexão, cada
 * liberação (`release`, ou `discard` se ela for descartada) e os comandos feitos direto no
 * pool (prefixo `pool: `). Serve para testar o ciclo de vida de uma transação.
 */
export class SpySqlPool implements SqlPool {
  readonly events: string[] = [];

  /**
   * @param failures - Erro que cada comando deve lançar, pelo texto exato do comando.
   */
  constructor(private readonly failures: Readonly<Record<string, Error>> = {}) {}

  /**
   * Anota um comando feito fora de uma conexão reservada.
   *
   * @param text - Comando SQL.
   * @returns Um resultado vazio.
   */
  query<Row>(text: string): Promise<SqlResult<Row>> {
    return this.run<Row>(`pool: ${text}`, text);
  }

  /**
   * Entrega uma conexão que anota seus comandos e sua liberação.
   *
   * @returns A conexão falsa.
   */
  connect(): Promise<SqlConnection> {
    return Promise.resolve({
      query: <Row>(text: string): Promise<SqlResult<Row>> => this.run<Row>(text, text),
      release: (destroy?: boolean): void => {
        this.events.push(destroy ? 'discard' : 'release');
      },
    });
  }

  /**
   * Anota o comando e responde, ou falha se houver erro configurado para ele.
   *
   * @param event - Texto a anotar.
   * @param text - Comando SQL, usado para procurar a falha configurada.
   * @returns Um resultado vazio.
   */
  private run<Row>(event: string, text: string): Promise<SqlResult<Row>> {
    this.events.push(event);
    const failure = this.failures[text];
    return failure ? Promise.reject(failure) : Promise.resolve(NOTHING);
  }
}
