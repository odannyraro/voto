import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import type { ElectionRecord } from '../../src/ports';

/**
 * Repositório em memória que pode segurar as próximas leituras até todas terem chegado. Assim
 * requisições concorrentes leem a mesma versão antes de qualquer uma gravar, sem depender da
 * ordem em que o event loop as executa.
 */
export class GatedReadsElectionRepository extends InMemoryElectionRepository {
  private expectedReads = 0;
  private readonly heldReads: (() => void)[] = [];

  /**
   * Segura as próximas leituras e as solta juntas quando a última chegar; as leituras
   * seguintes passam direto.
   *
   * @param count - Quantas leituras segurar.
   */
  holdNextReads(count: number): void {
    this.expectedReads = count;
  }

  /**
   * Lê a eleição, esperando as demais leituras seguradas antes de entregá-la.
   *
   * @param id - Id da eleição.
   * @returns O registro como estava quando esta leitura chegou, ou `null`.
   */
  override async get(id: string): Promise<ElectionRecord | null> {
    const record = await super.get(id);
    await this.waitForTheOthers();
    return record;
  }

  /**
   * Espera até o número de leituras seguradas se completar.
   *
   * @returns Uma promessa já resolvida se não houver o que segurar.
   */
  private waitForTheOthers(): Promise<void> {
    if (this.expectedReads === 0) return Promise.resolve();
    return new Promise((release) => {
      this.heldReads.push(release);
      if (this.heldReads.length < this.expectedReads) return;
      this.expectedReads = 0;
      this.heldReads.splice(0).forEach((deliver) => deliver());
    });
  }
}
