import type { Clock } from '../ports';

/**
 * Relógio de produção: a hora da máquina. É a fronteira com o tempo real; as regras de negócio
 * recebem um `Clock` e, nos testes, usam o `FakeClock`.
 */
export const systemClock: Clock = {
  /**
   * Lê a hora atual da máquina.
   *
   * @returns Um `Date` novo com o instante atual.
   */
  now: () => new Date(),
};
