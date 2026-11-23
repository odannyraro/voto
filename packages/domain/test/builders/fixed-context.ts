import type { CodeGenerator, DomainContext } from '../../src/index';

/** Instante fixo usado como "agora" nos testes, para que sejam determinísticos. */
export const FIXED_NOW = new Date('2026-11-28T12:00:00.000Z');

const MS_PER_SECOND = 1000;

/**
 * Cria um `DomainContext` determinístico: relógio parado e ids sequenciais
 * (`id-1`, `id-2`, ...), independentes entre testes.
 *
 * @param now - Instante devolvido como "agora"; padrão `FIXED_NOW`.
 * @returns Contexto pronto para passar aos comandos do domínio.
 */
export function fixedContext(now: Date = FIXED_NOW): DomainContext {
  let lastId = 0;
  return {
    now,
    newId: () => {
      lastId += 1;
      return `id-${lastId}`;
    },
  };
}

/**
 * Soma segundos a um instante, para montar prazos e "agoras" relativos sem cálculo no teste.
 *
 * @param base - Instante de partida.
 * @param seconds - Segundos a somar (negativo volta no tempo).
 * @returns Um novo `Date`.
 */
export function secondsAfter(base: Date, seconds: number): Date {
  return new Date(base.getTime() + seconds * MS_PER_SECOND);
}

/**
 * Gerador de códigos que devolve uma sequência fixa, em ordem (stub do `CodeGenerator`).
 *
 * @param codes - Códigos devolvidos, um por chamada.
 * @returns Um `CodeGenerator` que lança erro se a sequência acabar.
 * @throws {Error} Ao pedir mais códigos do que os informados (bug no teste).
 */
export function sequenceCodeGenerator(codes: readonly string[]): CodeGenerator {
  let next = 0;
  return {
    generate: () => {
      const code = codes[next];
      if (code === undefined) throw new Error('sequenceCodeGenerator ran out of codes');
      next += 1;
      return code;
    },
  };
}

/**
 * Gerador de códigos que nunca repete (`C0000001`, `C0000002`...), para testes que pedem
 * lotes grandes e não se importam com o valor de cada código.
 *
 * @returns Um `CodeGenerator` com códigos distintos de 8 caracteres.
 */
export function countingCodeGenerator(): CodeGenerator {
  let next = 0;
  return {
    generate: () => {
      next += 1;
      return `C${String(next).padStart(7, '0')}`;
    },
  };
}
