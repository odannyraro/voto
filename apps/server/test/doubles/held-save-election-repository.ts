import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import type { ElectionRecord } from '../../src/ports';

/** Uma gravação segurada: avisa quando chegou ao repositório e espera o teste decidir. */
export interface HeldSave {
  /** Resolve quando a gravação segurada chega ao repositório. */
  readonly reached: Promise<void>;
  /** Deixa a gravação seguir. */
  release(): void;
  /**
   * Faz a gravação segurada falhar, sem gravar nada.
   *
   * @param error - Erro que a gravação lança.
   */
  fail(error: Error): void;
}

/**
 * Repositório em memória que pode segurar a próxima gravação, para o teste agir enquanto ela
 * está em andamento. As demais gravações passam direto.
 */
export class HeldSaveElectionRepository extends InMemoryElectionRepository {
  private hold: (() => Promise<void>) | undefined;

  /**
   * Segura a próxima gravação.
   *
   * @returns O controle dessa gravação.
   */
  holdNextSave(): HeldSave {
    let arrive: () => void = () => undefined;
    let release: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const decision = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    this.hold = () => {
      arrive();
      return decision;
    };
    return { reached, release, fail };
  }

  /**
   * Grava o registro, esperando antes se esta for a gravação segurada.
   *
   * @param record - Registro a gravar.
   * @param expectedVersion - Versão que o chamador leu.
   * @throws {Error} O erro dado a `fail`, ou os do repositório em memória.
   */
  override async save(record: ElectionRecord, expectedVersion: number): Promise<void> {
    const held = this.hold;
    this.hold = undefined;
    await held?.();
    await super.save(record, expectedVersion);
  }
}
