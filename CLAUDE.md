# CLAUDE.md — Voto

Sistema web de eleições ao vivo (estilo Kahoot), feito para o TP de Teste de Software (DCC/UFMG). O objetivo do projeto é **demonstrar boas práticas de teste**. Código sem teste bom não conta como entregue.

Stack: TypeScript (strict) em monorepo npm workspaces · domínio puro · Fastify + Socket.IO · React + Vite · Vitest + Testing Library + MSW · Playwright · Postgres (prod) · GitHub Actions + Codecov.

**Idioma:** todo o **código** fica em **inglês**: identificadores, nomes de arquivos, descrições de `describe`/`it`, strings de teste, mensagens de log e de erro. Ficam em **português** apenas as respostas ao usuário, os **comentários** no código, os documentos em `docs/` e as **mensagens de commit**.

## Mapa de documentos (leia na hora certa, não tudo sempre)

| Arquivo | Quando ler |
|---|---|
| `docs/todo-<area>.md` | **Sempre, primeiro.** É a sua memória entre prompts: tarefas, notas do que já foi feito e mapa do código. O usuário diz qual área (`backend`, `domain`, `frontend`). Se não disser, pergunte. |
| `docs/architecture.md` | Só as seções citadas na tarefa. É a fonte da verdade de design e contratos (§5 domínio, §6 REST, §7 socket, §10 testes). |
| `docs/divisao-tarefas.md` | Para saber quem é dono de cada pasta e as dependências entre as partes. |
| `docs/requisitos.md` (antes da S0.1: `README.md`) | Regras originais da eleição, quando a tarefa tocar regra de negócio. |
| `README.md` | Entregável do TP (seções exigidas). Só edite quando a tarefa pedir. |
| `docs/setup-repositorio.md`, `docs/deploy.md` | Passos manuais **do usuário** (GitHub, Codecov, Render, Neon). Você escreve, o usuário executa. |

## Fluxo obrigatório de cada prompt

1. **Orientar-se.** Leia o TO-DO. Identifique a próxima tarefa `[ ]` (ou a que o prompt indicar) e confira o "Depende de". Se depender de código de outro integrante que ainda não existe, **pare e avise**.
2. **Entender.** Leia as seções do `architecture.md` citadas e o código já existente que será tocado. Use as notas do TO-DO para achar o código.
3. **Lista de testes.** Antes de codar, escreva em poucas linhas os comportamentos que vai testar: caminho feliz, caminhos de erro e limites.
4. **RED.** Escreva os testes. Crie só o esqueleto necessário para compilar (assinaturas que lançam erro ou retornam valor trivial). Rode e **veja falhar pelo motivo esperado**, ou seja, uma asserção falhando, não um erro de import. Teste que nunca falhou pode não testar nada.
5. **GREEN.** Implemente o mínimo para passar, em passos pequenos (*baby steps*). Rode os testes a cada passo.
6. **REFACTOR.** Melhore nomes, remova duplicação e quebre funções longas, no código **e** nos testes, mantendo tudo verde.
7. **Verificar o repositório inteiro:** `npm run lint`, `npm run typecheck` e `npm run test:coverage`. Todos verdes, com cobertura ≥ 80% em cada workspace.
8. **Registrar.** Marque `[x]` no TO-DO, preencha as *Notas do agente* no modelo do arquivo e atualize o "Mapa rápido do código".
9. **Responder** com: o que foi feito; arquivos criados ou alterados; testes adicionados e quantidade; comandos rodados e resultado; pendências; e uma **mensagem de commit sugerida** (Conventional Commits em português, ex.: `feat(server): adiciona rotas de candidatos`).

**IMPORTANTE:**
- **Nunca rode `git commit`, `git push` nem crie branches.** O usuário faz isso a partir da sua mensagem sugerida.
- **A tarefa só está concluída quando todos os testes passam.** Se não conseguir deixar verde, diga isso claramente e mostre o erro. Nunca declare sucesso sem ter rodado os comandos.

## Comandos (após o Sprint 0)

```bash
npm install                       # instala tudo (workspaces)
npm test                          # todos os testes
npm test -w apps/server           # só um workspace (packages/domain, apps/web, ...)
npx vitest run caminho/arquivo.test.ts -w apps/server   # um arquivo
npm run test:coverage             # testes + cobertura (falha abaixo de 80%)
npm run lint && npm run typecheck # qualidade
npm run e2e                       # Playwright (sobe o servidor sozinho)
npm run dev                       # servidor + web em modo desenvolvimento
```

## Mensagem de commit sugerida — padrão Conventional Commits

Formato: `<tipo>(<escopo>): <descrição>` (spec: conventionalcommits.org). Exemplo: `feat(server): adiciona rotas de candidatos`.

- **Tipos:**
  - `feat`: nova funcionalidade;
  - `fix`: correção de bug;
  - `test`: só testes;
  - `refactor`: muda o código sem mudar comportamento;
  - `docs`: documentação;
  - `style`: formatação;
  - `build`: dependências e build;
  - `ci`: workflows;
  - `chore`: manutenção;
  - `perf`: desempenho.
- **Escopos:** `shared`, `domain`, `server`, `web`, `e2e`, `ci`, `deps`. Omita o escopo se a mudança for na raiz ou em várias áreas.
- **Descrição:** em português, no presente ("adiciona", "corrige", não "adicionado"), minúscula, sem ponto final, até cerca de 72 caracteres no total.
- **Tipo pelo objetivo principal:** uma tarefa com código + testes é `feat` (ou `fix`), não `test`.
- **Corpo opcional** (depois de uma linha em branco): explica o **porquê** em 1 a 3 linhas. Mudança que quebra contrato leva `!` (`feat(shared)!: ...`) e uma linha `BREAKING CHANGE: ...` no corpo.

## Regras de teste (do material da disciplina, Prof. André Hora)

**Estrutura e legibilidade**
- **FIRST:** rápidos (ms, sem rede, banco ou disco reais em teste de unidade), independentes (qualquer ordem, sem estado compartilhado), determinísticos, autoverificáveis (passa ou falha, sem inspeção manual) e escritos antes do código (*timely*).
- **AAA:** Arrange, Act, Assert, separados por uma linha em branco. Um comportamento por teste e uma asserção **lógica** por teste. Vários `expect` só quando checam o mesmo conceito (ex.: campos de um objeto retornado).
- **Nomes** descrevem cenário + resultado esperado, como frase em inglês: `it('rejects a second vote from the same voter in a round')`. Agrupe com `describe('castVote')`. Proibido `test1` ou nomes que só repetem o método.
- **Teste comportamento, não método:** um método com 3 regras gera 3 testes. Uma regra que envolve vários métodos gera um teste que os usa juntos.
- **Teste pela API pública:** importe do `index.ts` do pacote ou chame a rota HTTP. Nunca exporte algo só para testar nem teste função privada.
- **DAMP > DRY em teste:** o leitor deve entender o teste sem pular para 5 helpers. *Builders* (`anElection().withPosition(...)`) são bem-vindos para esconder detalhes **irrelevantes**. Os valores que importam para o teste aparecem no próprio teste.
- **Testes estáveis:** depois de escrito, um teste só muda se o **requisito** mudar. Se uma refatoração quebrar um teste, ou a refatoração mudou comportamento ou o teste dependia de detalhe interno. Corrija a causa, não "ajuste" a asserção.
- Verifique só o que o teste é sobre (ex.: `toMatchObject` / `toContain` em vez de comparar um objeto gigante inteiro).

**O que testar**
- Caminho feliz **e** caminhos tristes: vazio, zero, negativo, limite exato, limite+1, entrada inválida, não autorizado, inexistente, prazo vencido.
- **Limites matam mutantes:** para a regra "> 50%", teste exatamente 50% (não elege) e 50% + 1 voto (elege), não só 80%.
- **Bug encontrado = teste de regressão primeiro** (vermelho), depois a correção.
- Não teste o framework ou a linguagem (getters triviais, se o Zod funciona, se o Fastify roteia). Teste as **nossas** regras.
- Dados mínimos e relevantes, fictícios e legíveis (`'Ana'`, `'President'`). Números com significado viram constantes nomeadas (`const SIMPLE_MAJORITY = ...`).
- Pirâmide: muitos testes de unidade, menos de integração (`app.inject`, socket real em porta efêmera, `pg-mem`) e poucos e2e, só para jornadas críticas.

**Test doubles (ordem de preferência)**
1. **Implementação real** (o domínio é puro e rápido: use-o de verdade sempre que existir).
2. **Fake** (ex.: `InMemoryElectionRepository`, `FakeClock`, `FakeScheduler`). Todo fake tem testes próprios ou passa na mesma suíte de contrato da implementação real.
3. **Stub** (respostas prontas).
4. **Spy/mock** (verifica chamadas), com moderação.

Mais regras de doubles:
- Faça double **só nas fronteiras** (relógio, timers, rede, banco, socket, aleatoriedade) e **só de interfaces nossas** (as portas em `apps/server/src/ports`). Nunca de bibliotecas de terceiros diretamente.
- Prefira **verificar estado** (o resultado) a verificar interação. Verifique a chamada apenas quando ela **é** o comportamento (ex.: "notificou o admin").
- Sinal de excesso de mocks: mais de 2 dependências mockadas ou mock configurando vários métodos. Nesse caso, use fake ou o real.
- O *stub do domínio* no servidor é temporário, só até o domínio real existir (tarefa B16a).

**Test smells proibidos**

| Smell | Faça em vez disso |
|---|---|
| Conditional Test Logic (`if`, `for`, `switch`, cálculos no teste) | Valores esperados explícitos. Use `it.each` com tabela para variações do mesmo comportamento. |
| Assertion Roulette / Eager Test | Um comportamento por teste. Se usar vários `expect`, todos sobre o mesmo conceito. |
| Exception Handling (`try/catch` no teste) | `expect(() => f()).toThrow(X)` ou `await expect(p).rejects...`. Para `Result`, `expect(r).toEqual({ ok: false, error: ... })`. |
| Sleepy Test (`setTimeout`, `sleep`, `waitForTimeout`) | `vi.useFakeTimers()` / `FakeClock`; no front, `findBy*` / `waitFor`; no Playwright, `expect(...).toBeVisible()`. |
| Mystery Guest (arquivo, banco ou rede reais em teste de unidade) | Dados no próprio teste e fakes. |
| General Fixture (`beforeEach` monta o que poucos testes usam) | `beforeEach` mínimo; o resto vai para cada teste ou para um builder. |
| Resource Optimism (servidor ou socket não fechado) | Fechar em `afterEach` (`app.close()`, `socket.disconnect()`). |
| Magic Number | Constante nomeada ou valor óbvio no contexto. |
| Redundant Print (`console.log` em teste) | Remover. O teste se autoverifica. |
| Unknown Test (sem asserção) / Empty Test | Todo teste tem `expect`. |
| Ignored Test (`.skip`, `.only`, `.todo` commitado) | Nunca deixar no código. |
| Sensitive Equality (comparar `toString` ou JSON serializado) | Comparar campos ou objetos. |
| Flaky (depende de hora, ordem, aleatoriedade ou rede) | Injetar `Clock`, `CodeGenerator` e ids; cada teste cria seus dados. |

**Cobertura e mutação**
- Cobertura é **sinal, não meta**: use o relatório para achar caminhos não testados e avalie se são relevantes. Não escreva teste sem asserção útil só para subir número.
- Os limites (80% em linhas, branches, funções e statements por workspace) **nunca** são reduzidos. Ignorar cobertura (`/* v8 ignore */`, exclusões novas) é proibido. As únicas exclusões são as do `architecture.md` §10.1 (arquivos "humildes" de composição, como `main.ts`).
- No domínio, pense como teste de mutação (StrykerJS): se trocar `>=` por `>` ou `+` por `-`, algum teste falha?

## Código de produção

**Design para testabilidade (Humble Object)**
- Lógica em funções puras e pequenas. Partes difíceis de testar (HTTP, socket, banco, timers, UI) ficam finas e só delegam.
- Dependências entram por parâmetro ou construtor (portas). Proibido `Date.now()`, `new Date()` sem argumento, `Math.random()` ou `crypto` direto em regra de negócio. Use `Clock`, `DomainContext` e `CodeGenerator`.
- Erros esperados do domínio são valores (`Result` com `DomainError.code`). `throw` é para bugs ou para erros HTTP na borda.
- Respeite a direção dos imports (`architecture.md` §3): `web` → `shared`; `server` → `domain`, `shared`; `domain` → `shared`.

**Estilo TypeScript** (Prettier e ESLint garantem a forma; isto é o que eles não garantem)
- `strict`, sem `any` (use `unknown` + validação). Sem `!` (*non-null assertion*) para silenciar o compilador. Sem `@ts-ignore`.
- Nomes: `camelCase` para variáveis e funções; `PascalCase` para tipos, classes e componentes React; `UPPER_SNAKE_CASE` para constantes; arquivos em `kebab-case.ts` (componentes React em `PascalCase.tsx`). Nomes revelam intenção (`eligibleCandidates`, não `list2`).
- Só *named exports*. Exporte o mínimo; cada pacote expõe sua API pelo `index.ts`.
- Funções curtas (até cerca de 30 linhas), com retorno antecipado em vez de `if` aninhado, poucos parâmetros (mais de 3 → objeto) e tipo de retorno explícito nas exportadas.
- Prefira `const`, dados imutáveis (`readonly`, spread em vez de mutação), *unions* discriminadas e `switch` exaustivo com checagem `never`.
- `async/await`, sem promessas soltas. Nada de `console.log` em produção (use o logger do Fastify).
- React: componentes de função; lógica em hooks e `lib/`; componentes de página só renderizam. Use elementos acessíveis (`<button>`, `<label>`), porque os testes buscam por *role* e *label*.
- Código multiplataforma (CI roda em Linux, macOS e Windows): `node:path` para caminhos, sem comandos de shell Unix em scripts npm (use `rimraf` / `cross-env`), sem dependências nativas.

**Comentários**
- **Toda função, método, classe e componente tem TSDoc completo**, exportado ou não:
  - **Resumo** de 1 a 3 linhas dizendo **o que faz e por que existe**, em linguagem de negócio.
  - **`@param`** para **cada** parâmetro (em componentes React, `@param props`; em classes, os parâmetros do construtor), dizendo o que é e restrições relevantes.
  - **`@returns`** sempre que houver retorno (em `void`/`Promise<void>`, descreva o efeito no resumo). Para `Result`, descreva os casos de sucesso **e** os códigos de erro possíveis.
  - **`@throws`** quando a função pode lançar exceção (ex.: `HttpError`), dizendo em que situação.
  - Tipos e interfaces exportados levam um resumo de 1 linha; campos não óbvios ganham um comentário próprio.

  Exemplo:
  ```ts
  /**
   * Apura uma rodada fechada: conta os votos válidos (brancos não entram) e decide
   * se há eleito, se é preciso 2º turno ou se não houve votos válidos.
   *
   * @param round - Rodada já fechada, com a contagem de votos congelada.
   * @param candidates - Candidatos da eleição; usados no desempate por idade ou tempo restante.
   * @returns O resultado da rodada: `ELECTED` com o eleito, `RUNOFF_REQUIRED` com os dois
   *   finalistas ou `NO_VALID_VOTES`.
   * @throws {Error} Se a rodada ainda estiver aberta (indica bug de quem chamou).
   */
  export function computeResult(round: Round, candidates: Candidate[]): RoundResult
  ```
- Dentro das funções, comente o **porquê** (regra de negócio, decisão não óbvia, armadilha), nunca o **o quê** que o código já diz. Cite a regra quando útil (`// README: eleito sai dos próximos cargos`).
- Sem código comentado, sem `TODO` órfão (pendências vão para o TO-DO), sem comentário desatualizado. Se mudar o código, atualize o comentário.
- Em testes, o nome do teste é o comentário. Comente só um *Arrange* não óbvio.

## Limites do agente

- **Nunca:**
  - apagar, enfraquecer ou pular testes para "ficar verde";
  - reduzir limites de cobertura;
  - alterar pastas de outro integrante (ver `divisao-tarefas.md`);
  - mudar contratos de `packages/shared` sem pedir ao usuário;
  - colocar segredos no código (use variáveis de ambiente e `.env`, que fica fora do git);
  - fazer tarefas futuras do TO-DO "de brinde".
- **Pergunte antes de:**
  - adicionar dependência fora da stack do `architecture.md` §2;
  - divergir do `architecture.md`;
  - fazer qualquer coisa ambígua nas regras da eleição (antes de perguntar, consulte §5.4 e §5.5).
- **CI/CD (GitHub Actions + Codecov):** os mesmos comandos do passo 7 rodam a cada push nos 3 sistemas operacionais. Se passam localmente e você seguiu as regras multiplataforma, devem passar no CI. Só edite `.github/workflows/` quando a tarefa pedir. Se o usuário colar um log de falha do CI, reproduza localmente quando possível e corrija a causa (não desligue o passo).
- Se um teste de **outra** área falhar sem relação com sua mudança, não corrija o código do colega: relate ao usuário.
