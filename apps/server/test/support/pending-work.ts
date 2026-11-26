/**
 * Deixa rodar tudo o que já pode rodar sem esperar tempo nenhum (promessas pendentes e o que
 * elas encadeiam): quem não depende de outra coisa termina, e quem depende fica parado. Não é
 * uma espera por tempo: resolve na próxima volta do event loop.
 *
 * @returns Promessa resolvida na próxima volta do event loop.
 */
export function flushPendingWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
