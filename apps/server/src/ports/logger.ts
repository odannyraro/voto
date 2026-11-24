/** Porta de log: o serviço registra falhas sem conhecer o logger do Fastify (que a satisfaz). */
export interface Logger {
  /**
   * Registra um erro que não derruba o processo.
   *
   * @param context - Dados estruturados do erro (`err` leva a exceção capturada).
   * @param message - Descrição curta do que falhou.
   */
  error(context: object, message: string): void;
}
