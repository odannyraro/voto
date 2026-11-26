/** Relógios necessários para calcular o prazo usando o instante de referência do servidor. */
export interface CountdownClock {
  /** Prazo absoluto da rodada em ISO 8601. */
  readonly deadline: string;
  /** Hora do servidor recebida junto ao estado da rodada. */
  readonly serverNow: string;
  /** Hora local no momento em que `serverNow` foi recebido. */
  readonly clientNowAtSync: string;
  /** Hora local atual usada para avançar o countdown. */
  readonly clientNow: string;
}

/**
 * Converte uma data ISO em milissegundos e rejeita valores que não representam um instante.
 *
 * @param value - Data ISO recebida pela aplicação.
 * @returns Instante em milissegundos desde Unix epoch.
 * @throws {RangeError} Quando a string não representa uma data válida.
 */
function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }

  return timestamp;
}

/**
 * Calcula os segundos restantes corrigindo o relógio local com a hora do servidor.
 *
 * @param clock - Prazo, hora do servidor e amostras locais na sincronização e no instante atual.
 * @returns Segundos restantes arredondados para cima, nunca abaixo de zero.
 * @throws {RangeError} Quando qualquer uma das datas não for válida.
 */
export function getRemainingSeconds(clock: CountdownClock): number {
  const deadlineTimestamp = parseTimestamp(clock.deadline);
  const serverTimestamp = parseTimestamp(clock.serverNow);
  const clientSyncTimestamp = parseTimestamp(clock.clientNowAtSync);
  const clientTimestamp = parseTimestamp(clock.clientNow);
  const serverOffset = serverTimestamp - clientSyncTimestamp;
  const correctedServerNow = clientTimestamp + serverOffset;

  return Math.max(0, Math.ceil((deadlineTimestamp - correctedServerNow) / 1000));
}
