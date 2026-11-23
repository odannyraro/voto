// O domínio não lê relógio nem gera ids ou códigos sozinho: tudo chega de fora, o que
// mantém as regras puras e os testes repetíveis (o R de FIRST).

/** Dependências de tempo e identidade que os comandos do domínio recebem de fora. */
export interface DomainContext {
  /** Instante considerado "agora" pelo comando. */
  readonly now: Date;
  /** Gera um id novo e único. */
  readonly newId: () => string;
}

/** Fonte de códigos de eleitor; o servidor garante a unicidade global dos códigos. */
export interface CodeGenerator {
  /** Devolve o próximo código de eleitor. */
  generate(): string;
}
