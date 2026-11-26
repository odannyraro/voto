/**
 * Fila em memória por chave: tarefas da mesma chave rodam uma de cada vez, na ordem de chegada;
 * chaves diferentes não esperam umas pelas outras. Serve para que cada gravação de uma eleição
 * leia o resultado da anterior. Só coordena **um processo**: com mais de uma instância do
 * servidor, quem protege os dados é a conferência de versão do repositório.
 */
export class KeyedQueue {
  /** Fim da fila de cada chave com tarefa pendente: resolve quando a última terminar. */
  private readonly tails = new Map<string, Promise<void>>();

  /**
   * Quantas chaves têm tarefa em andamento ou à espera; chaves ociosas são esquecidas.
   *
   * @returns A quantidade de chaves ocupadas.
   */
  get size(): number {
    return this.tails.size;
  }

  /**
   * Executa a tarefa quando todas as anteriores da mesma chave terminarem, com sucesso ou não.
   *
   * @param key - Chave que agrupa as tarefas que não podem se sobrepor.
   * @param task - Tarefa a executar. Não pode enfileirar outra na mesma chave e esperar por
   *   ela, ou as duas ficariam esperando para sempre.
   * @returns O resultado da tarefa.
   * @throws {Error} O erro da tarefa; as seguintes rodam mesmo assim.
   */
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key);
    let finish: () => void = () => undefined;
    const turn = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // Entra na fila antes de qualquer espera, para a ordem ser a de chegada.
    this.tails.set(key, turn);

    await previous;
    try {
      return await task();
    } finally {
      if (this.tails.get(key) === turn) this.tails.delete(key);
      finish();
    }
  }
}
