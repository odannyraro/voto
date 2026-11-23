import type { Clock } from '../../src/ports';

/** Relógio de teste: o tempo só anda quando o teste manda. */
export class FakeClock implements Clock {
  private currentMs: number;

  /**
   * @param initial - Instante inicial do relógio.
   */
  constructor(initial: Date) {
    this.currentMs = initial.getTime();
  }

  /**
   * Devolve o instante atual do relógio.
   *
   * @returns Uma cópia: alterá-la não move o relógio.
   */
  now(): Date {
    return new Date(this.currentMs);
  }

  /**
   * Define o instante atual.
   *
   * @param instant - Novo instante.
   */
  set(instant: Date): void {
    this.currentMs = instant.getTime();
  }

  /**
   * Avança o relógio.
   *
   * @param ms - Milissegundos a somar (acumula entre chamadas).
   */
  advance(ms: number): void {
    this.currentMs += ms;
  }
}
