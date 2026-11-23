import type { CodeGenerator } from '../../src/ports';

/** Gerador de teste: devolve uma sequência fixa de códigos. */
export class StubCodeGenerator implements CodeGenerator {
  private readonly remaining: string[];

  /**
   * @param codes - Códigos a devolver, na ordem.
   */
  constructor(codes: readonly string[]) {
    this.remaining = [...codes];
  }

  /**
   * Devolve o próximo código da sequência.
   *
   * @returns O próximo código.
   * @throws {Error} Se a sequência acabou.
   */
  generate(): string {
    const next = this.remaining.shift();
    if (next === undefined) throw new Error('StubCodeGenerator has no more codes');
    return next;
  }
}
