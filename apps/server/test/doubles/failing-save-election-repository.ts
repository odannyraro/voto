import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import type { ElectionRecord } from '../../src/ports';

/**
 * Repositório em memória cujas próximas gravações falham com os erros enfileirados pelo teste
 * (ex.: uma sequência de `VERSION_CONFLICT`), para exercitar as novas tentativas do serviço.
 * Quando os erros acabam, as gravações voltam a funcionar como no repositório em memória.
 */
export class FailingSaveElectionRepository extends InMemoryElectionRepository {
  /** Erros que as próximas gravações lançam, um por gravação, em ordem. */
  pendingFailures: Error[] = [];
  /** Roda a cada falha, para simular o que acontece enquanto quem grava espera. */
  onFailure: () => void = () => undefined;

  /**
   * Falha com o próximo erro enfileirado, sem gravar nada; sem erro na fila, grava.
   *
   * @param record - Registro a gravar.
   * @param expectedVersion - Versão que o chamador leu.
   * @throws {Error} O próximo erro de `pendingFailures`, ou os do repositório em memória.
   */
  override save(record: ElectionRecord, expectedVersion: number): Promise<void> {
    const failure = this.pendingFailures.shift();
    if (!failure) return super.save(record, expectedVersion);
    this.onFailure();
    return Promise.reject(failure);
  }
}
