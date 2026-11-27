import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { getRemainingSeconds, type CountdownClock } from '../lib/countdown';

/** Propriedades para exibir uma contagem regressiva sincronizada ao servidor. */
export interface CountdownProps {
  readonly clock: Omit<CountdownClock, 'clientNow'>;
}

/**
 * Formata segundos restantes como minutos e segundos para leitura rápida.
 *
 * @param totalSeconds - Quantidade não negativa de segundos restantes.
 * @returns Texto no formato `MM:SS`, com minutos que podem exceder 59.
 */
function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

/**
 * Exibe o tempo restante até o prazo.
 *
 * @param props - Prazo, hora do servidor e instante local de sincronização.
 * @returns Contagem regressiva acessível.
 */
export function Countdown({ clock }: CountdownProps): ReactElement {
  const [clientNow, setClientNow] = useState(() => Date.now());
  const remainingSeconds = getRemainingSeconds({
    ...clock,
    clientNow: new Date(clientNow).toISOString(),
  });

  useEffect(() => {
    if (remainingSeconds === 0) {
      return;
    }

    const intervalId = window.setInterval(() => setClientNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [remainingSeconds]);

  return (
    <time role="timer" aria-label="Tempo restante">
      {formatRemainingTime(remainingSeconds)}
    </time>
  );
}
