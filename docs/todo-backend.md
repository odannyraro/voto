# TO-DO — Integrante B (Sprint 0 + Backend + Infraestrutura)

Este arquivo é a **memória de trabalho do agente de IA** da parte B. Ele lista, em ordem, tudo o que precisa existir para a parte B ficar implementada e testada, partindo de um repositório vazio. Também registra, tarefa a tarefa, o que já foi feito.

Documentos de referência (leia as seções citadas em cada tarefa):
- [architecture.md](architecture.md): stack, arquitetura, contratos (§5 domínio, §6 REST, §7 socket, §8 backend, §10 testes, §12 CI, §13 deploy).
- [divisao-tarefas.md](divisao-tarefas.md): o que é de A, B e C, e as regras de convivência.
- `CLAUDE.md` (raiz): como codar (TDD, convenções). Tem prioridade sobre este arquivo em caso de conflito.

---

## Como o agente usa este arquivo

1. **Antes de qualquer coisa**, leia este arquivo inteiro: as tarefas marcadas `[x]` e as *Notas do agente* abaixo delas dizem como o código atual funciona. Depois leia a seção "Mapa rápido do código".
2. **Execute apenas a próxima tarefa `[ ]`** da lista (a primeira não marcada), a menos que o prompt indique outra. Não adiante partes de tarefas futuras.
3. **Confira o campo "Depende de".** Se a tarefa depende de algo de A ou C que ainda não está na `main`, **pare e avise** o usuário, sem improvisar a parte do colega. O usuário decide se pula para a tarefa seguinte.
4. Siga o ciclo **TDD** do `CLAUDE.md`: primeiro os testes listados em "Testes (escrever antes)", vendo-os falhar; depois o código mínimo; depois refatorar. A tarefa só termina quando `npm run lint`, `npm run typecheck` e `npm test` passam **no repositório inteiro**.
5. **Ao concluir:**
   - troque `[ ]` por `[x]` na tarefa;
   - preencha as *Notas do agente* da tarefa usando o modelo abaixo (máximo de cerca de 10 linhas, direto ao ponto);
   - atualize o "Mapa rápido do código" se criou módulos novos;
   - **não faça commit.** Termine a resposta com a mensagem de commit sugerida na tarefa (Conventional Commits, em português), ajustada ao que foi realmente feito. O usuário revisa e faz o commit de tudo (código, testes e este arquivo).
6. **Contratos.** Se perceber que precisa mudar algo em `packages/shared` (DTOs, schemas, eventos) depois do Sprint 0, ou divergir do `architecture.md`, **pare e pergunte ao usuário**. Essas mudanças afetam A e C. Divergências aprovadas são registradas em "Decisões e desvios" no fim deste arquivo.
7. **Pastas.** A parte B é dona da raiz do monorepo, de `packages/shared`, `apps/server`, `.github/` e dos arquivos de deploy. `packages/domain` é de A e `apps/web` é de C. Depois do Sprint 0, não altere essas pastas.

**Modelo das Notas do agente** (substitua o `_pendente_`):

```
- Feito: <1–2 linhas sobre o que passou a existir>
- Arquivos: <caminhos principais>
- Como usar: <assinatura/rota/comando que os próximos passos vão chamar>
- Testes: <arquivo(s) de teste e quantidade de testes>
- Decisões: <escolhas não óbvias; "nenhuma" se não houver>
```

**Git.** O agente **não** roda `git commit`, `git push` nem cria branches: o usuário cuida disso. Para referência: as tarefas do Sprint 0 vão direto na `main`; a partir da B1, o usuário usa uma branch por tarefa (`feat/server-<id>-<slug>`) e abre PR. Na S0.1, o agente pode rodar `git init` só se o repositório ainda não existir.

---

## Mapa rápido do código

> Mantido pelo agente. Uma linha por módulo importante: caminho → para que serve.

_(vazio até a primeira tarefa)_

---

## Sprint 0 — Base comum (antes de A e C começarem)

O objetivo do Sprint 0 é que A e C abram o projeto e só "preencham os vazios": tudo compila, todo workspace tem um teste rodando e o CI está verde.

### [ ] S0.1 — Monorepo, TypeScript e qualidade de código
**Ref.:** architecture §2, §3 (regra de direção de imports), §4, §14.
**Fazer:**
- Inicializar o git se ainda não existir. Criar `.gitignore` (`node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `.env*`), `.gitattributes` com `* text=auto eol=lf` (evita quebras do Prettier no Windows), `.editorconfig` e `.nvmrc` com `24`.
- Mover o conteúdo atual do `README.md` (requisitos do sistema) para `docs/requisitos.md`. Criar um `README.md` novo só com os títulos exigidos pelo enunciado (Integrantes, Sobre o sistema, Tecnologias, Uso de IA, Execução dos testes), com marcadores "a preencher".
- `package.json` raiz: `private`, `"type": "module"`, `engines.node >= 24`, `workspaces: ["packages/*", "apps/*"]`. O C adiciona `e2e` mais tarde.
- `.npmrc` com `engine-strict=true`, para o `npm install` falhar logo se alguém estiver com o Node errado (o "ambiente" do projeto é: Node fixado no `.nvmrc` + dependências locais em `node_modules` travadas pelo `package-lock.json`; não há venv nem Docker).
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `module`/`moduleResolution` `"Bundler"` (ou `NodeNext`, com justificativa nas notas), `target ES2023`.
- Criar os workspaces `packages/shared` (`@voto/shared`), `packages/domain` (`@voto/domain`) e `apps/server` (`@voto/server`), cada um com `package.json`, `tsconfig.json` e `src/index.ts` mínimo. `shared` e `domain` exportam o código-fonte TS direto (`"exports": { ".": "./src/index.ts" }`), sem passo de build.
- ESLint (flat config, `typescript-eslint`) + Prettier. Regra `no-restricted-imports` para a direção das dependências: `shared` não importa nada de `@voto/*`; `domain` só importa `@voto/shared`; o `web` não pode importar `@voto/domain` nem `@voto/server`.
- Scripts raiz: `lint`, `format`, `format:check`, `typecheck` (roda em todos os workspaces), todos multiplataforma.

**Testes (escrever antes):** é uma tarefa de configuração. A verificação é rodar `npm install`, `npm run lint` e `npm run typecheck` sem erros, e confirmar que um import proibido (teste manual temporário, ex.: `shared` importando `@voto/domain`) é acusado pelo lint. Desfaça o import depois.
**Pronto quando:** os comandos acima passam; a estrutura bate com a §4.
**Commit sugerido:** `chore: cria monorepo com workspaces, TypeScript, ESLint e Prettier`
**Notas do agente:** _pendente_

### [ ] S0.2 — Vitest e cobertura em cada workspace
**Ref.:** architecture §10.1, §14.
**Fazer:**
- Instalar `vitest` e `@vitest/coverage-v8`. Criar um `vitest.config.ts` por workspace com: provider `v8`, reporters `text` e `lcov`, saída em `<workspace>/coverage/`, `include: ['src/**']` e thresholds de 80% (linhas, branches, funções, statements). No servidor, excluir `src/main.ts` da cobertura.
- Um teste "fumaça" por workspace (ex.: `shared` exporta `APP_NAME = 'Voto'` e o teste verifica o valor). Os nomes dos testes ficam em inglês e descrevem comportamento (ver CLAUDE.md).
- Scripts por workspace: `test` e `test:coverage`. Scripts raiz: `test` e `test:coverage`, que rodam em todos os workspaces com `--workspaces --if-present`.

**Testes (escrever antes):** os testes fumaça de cada workspace.
**Pronto quando:** `npm test` e `npm run test:coverage` passam na raiz e geram `coverage/lcov.info` em cada workspace.
**Commit sugerido:** `test: configura Vitest com cobertura mínima de 80% em todos os workspaces`
**Notas do agente:** _pendente_

### [ ] S0.3a — Contratos: DTOs, códigos de erro e eventos de socket
**Ref.:** architecture §5.1, §6.3, §7.
**Fazer:**
- `packages/shared/src/dto.ts`: todos os tipos da §5.1 (`Election`, `Position`, `Candidate`, `Voter`, `Round`, `TiebreakRule`, os status) e da §6.3 (`AdminElectionDTO`, `VoterStateDTO`, `RoundResultDTO`, `NextPositionDTO`, `RoundView`, `ElectionSummaryDTO`, `ErrorDTO`).
- `packages/shared/src/error-codes.ts`: constante `ERROR_CODES` (`as const`) com todos os códigos citados no architecture (`VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `ELECTION_NOT_FOUND`, `VOTER_ALREADY_VOTED`, `ROUND_EXPIRED`, `INVALID_FIRST_CHOICE`, `CANDIDATE_ALREADY_ELECTED`, `ROUND_NOT_OPEN`, `NOTHING_TO_UNDO`, `INVALID_CODE`, `VOTER_REVOKED`, `VERSION_CONFLICT`...) e o tipo `ErrorCode`.
- `packages/shared/src/socket-events.ts`: `SOCKET_EVENTS = { ADMIN_STATE: 'admin:state', VOTER_STATE: 'voter:state', ADMIN_WATCH: 'admin:watch' }` + tipos `ServerToClientEvents` / `ClientToServerEvents` (formato do Socket.IO).
- Reexportar tudo em `src/index.ts`.

**Testes (escrever antes):** os nomes dos eventos são únicos e seguem o padrão `<papel>:<ação>`; os códigos de erro são únicos e estão em `UPPER_SNAKE_CASE`. Os tipos são validados pelo `typecheck`.
**Pronto quando:** `typecheck` e testes passam; os tipos refletem exatamente o architecture.
**Commit sugerido:** `feat(shared): define DTOs, códigos de erro e eventos de tempo real`
**Notas do agente:** _pendente_

### [ ] S0.3b — Contratos: schemas Zod dos corpos de requisição
**Ref.:** architecture §6.1, §6.2.
**Fazer:**
- `packages/shared/src/api-schemas.ts`: um schema Zod para cada corpo de requisição das tabelas §6.1 e §6.2 (login, criar/editar eleição, cargo, fila, candidato, gerar eleitores, abrir rodada, 2º turno, cancelar cargo, sessão de eleitor, voto). Exportar também os tipos inferidos (`LoginBody` etc.).
- Regras: strings sem espaços nas pontas e não vazias; `tiebreak` é enum; `age` é inteiro de 16 a 120; `remainingMonths` é inteiro ≥ 0; `count` de eleitores vai de 1 a 500; `durationSeconds` vai de 5 a 3600; `firstChoicePositionId` precisa estar em `applications` (`refine`); `code` é normalizado para maiúsculas e tem exatamente 8 caracteres; `choice` é um id não vazio ou `'BLANK'`.

**Testes (escrever antes):** para cada schema, ao menos um caso válido e os casos inválidos mais relevantes. Use `it.each` com tabela nomeada só quando forem variações do mesmo comportamento.
**Pronto quando:** todos os schemas da §6 existem e estão testados; cobertura do `shared` ≥ 80%.
**Commit sugerido:** `feat(shared): adiciona schemas Zod dos corpos da API`
**Notas do agente:** _pendente_

### [ ] S0.4 — Esqueleto da API pública do domínio
**Ref.:** architecture §5.2. **Atenção:** depois desta tarefa, `packages/domain` passa a ser de A.
**Fazer:**
- `packages/domain/src/errors.ts`: classe `DomainError` (`code: ErrorCode`, `message`) e classe `NotImplementedError`. A1 (de A) poderá ampliar esse arquivo.
- `packages/domain/src/types.ts`: `Result<T>`, `DomainContext`, `RoundResult`, `NextPositionInfo`, `History<T> = { current: T; past: T[] }`, `CodeGenerator`.
- `packages/domain/src/index.ts`: **todas** as funções listadas na §5.2, mais `finishElection`, `annulRound`, `pushSnapshot`, `undo` e as visões por papel (`toVoterView` ou equivalente, citadas em A16). Cada função tem a assinatura final tipada e corpo `throw new NotImplementedError('<nome>')`.
- Exportar `type DomainApi = typeof import('./index')`. O servidor recebe o domínio por injeção usando esse tipo.

**Testes (escrever antes):** um teste temporário, `test/public-api.test.ts`, que verifica que cada função exportada lança `NotImplementedError` (`it.each` sobre a lista de nomes). Isso mantém a cobertura ≥ 80% enquanto nada está implementado. Deixe um comentário dizendo que A remove cada item ao implementar a função.
**Pronto quando:** o servidor consegue `import type { DomainApi } from '@voto/domain'` e tudo compila.
**Commit sugerido:** `feat(domain): declara a API pública do domínio com stubs`
**Notas do agente:** _pendente_

### [ ] S0.5 — Esqueleto do frontend
**Ref.:** architecture §9, §14. **Atenção:** depois desta tarefa, `apps/web` passa a ser de C.
**Fazer:**
- `apps/web` (`@voto/web`) com Vite + React + TypeScript + React Router. Rota `/` com um título "Voto", vindo de `APP_NAME` do `@voto/shared`, para provar que o import entre workspaces funciona.
- Vitest com `jsdom`, `@testing-library/react`, `@testing-library/user-event` e `@testing-library/jest-dom` (arquivo de setup). Cobertura excluindo `src/main.tsx`.
- Proxy no `vite.config.ts`: `/api` e `/socket.io` (com `ws: true`) apontando para `http://localhost:3000`.
- Scripts: `dev`, `build`, `preview`, `test`, `test:coverage`, `typecheck`.

**Testes (escrever antes):** `App` renderiza o título "Voto" (busca por `getByRole('heading')`).
**Pronto quando:** `npm test`, `npm run typecheck` e `npm run build -w apps/web` passam.
**Commit sugerido:** `feat(web): cria esqueleto do frontend com React, Vite e Testing Library`
**Notas do agente:** _pendente_

### [ ] S0.6 — CI no GitHub Actions + Codecov
**Ref.:** architecture §12.
**Fazer:**
- `.github/workflows/ci.yml`, disparado em `push` e `pull_request`, com:
  - matriz `ubuntu-latest`, `macos-latest`, `windows-latest` e `fail-fast: false`;
  - `concurrency` que cancela execuções antigas da mesma branch;
  - `actions/setup-node` com `node-version-file: .nvmrc` e `cache: npm`;
  - `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck` e `npm run test:coverage`.
- Upload no Codecov (`codecov/codecov-action`) **só no Ubuntu**, um passo por flag (`shared`, `domain`, `server`, `web`), cada um com o `lcov.info` do workspace e o token `secrets.CODECOV_TOKEN`.
- Escrever em `docs/setup-repositorio.md` os passos manuais que **o usuário** precisa fazer: criar o repositório no GitHub, conectar o Codecov e criar o secret `CODECOV_TOKEN`.

**Testes (escrever antes):** não se aplica (configuração). Valide a sintaxe do YAML, por exemplo com `npx --yes yaml-lint` ou revisão cuidadosa. Garanta que os comandos funcionam localmente.
**Pronto quando:** o workflow existe e os comandos que ele roda passam localmente. Depois que o usuário fizer o push, a execução precisa ficar verde nos 3 SOs. Se falhar, a correção vira parte desta tarefa.
**Commit sugerido:** `ci: executa lint, typecheck e testes com cobertura em Linux, macOS e Windows`
**Notas do agente:** _pendente_

---

## Servidor — fundações

### [ ] B1 — Portas e test doubles
**Ref.:** architecture §8.1; aulas 17 e 18 (test doubles).
**Fazer:**
- `apps/server/src/ports/`: interfaces `ElectionRepository`, `AdminRepository`, `Clock`, `Scheduler`, `CodeGenerator` (reusar o tipo do domínio) e `Notifier`.
- O repositório guarda um `ElectionRecord = History<Election>` (eleição atual + snapshots anteriores), para o desfazer sobreviver a reinícios. Métodos: `get(id)`, `create(record)`, `save(record, expectedVersion)`, `listByAdmin(adminId)`, `listAll()`, `findByVoterCode(code) → { electionId, voterId } | null`, `isCodeTaken(code)`.
- `AdminRepository`: `findByUsername`, `findById`, `create`.
- `apps/server/test/doubles/`:
  - `FakeClock` (`now`, `set`, `advance(ms)`);
  - `FakeScheduler` (`schedule`, `cancel`, `pending()`, `fireDue(now)`, `fire(key)`);
  - `SpyNotifier` (guarda as chamadas `adminState` e `voterState` em arrays);
  - `StubCodeGenerator` (devolve uma sequência fixa).

**Testes (escrever antes):** comportamento dos doubles em que os outros testes vão confiar:
- `FakeClock.advance` soma corretamente;
- `FakeScheduler` só dispara as tarefas vencidas e `cancel` impede o disparo;
- reagendar a mesma chave substitui a tarefa anterior;
- `StubCodeGenerator` devolve a sequência em ordem.

**Pronto quando:** interfaces documentadas com JSDoc curto; doubles testados.
**Commit sugerido:** `feat(server): define portas da aplicação e test doubles`
**Notas do agente:** _pendente_

### [ ] B2 — Repositórios em memória + suíte de contrato
**Ref.:** architecture §8.1.
**Fazer:**
- `apps/server/test/contracts/election-repository.contract.ts`: função `describeElectionRepositoryContract(nome, makeRepo)` com os testes de comportamento de **qualquer** implementação. A B17 vai reutilizar essa função para o Postgres.
- `InMemoryElectionRepository`:
  - devolve **cópias** (`structuredClone`), para que alterar o retorno não mude o que está guardado;
  - `save` com `expectedVersion` diferente da versão guardada lança `VERSION_CONFLICT`;
  - mantém um índice de códigos de eleitor.
- `InMemoryAdminRepository`.

**Testes (escrever antes):**
- salvar e obter;
- `get` de id inexistente devolve `null`;
- conflito de versão;
- alterar o objeto retornado não afeta o que está guardado;
- `listByAdmin` filtra pelo dono;
- `findByVoterCode` acha o eleitor;
- `isCodeTaken`;
- `username` duplicado de admin é rejeitado.

**Pronto quando:** a suíte de contrato roda contra a implementação em memória.
**Commit sugerido:** `feat(server): implementa repositórios em memória com testes de contrato`
**Notas do agente:** _pendente_

### [ ] B3 — Configuração por variáveis de ambiente
**Ref.:** architecture §8.4, §13.
**Fazer:** `apps/server/src/config.ts` com a função pura `loadConfig(env)`, que valida com Zod e devolve um objeto tipado.

| Variável | Regra |
|---|---|
| `PORT` | padrão 3000 |
| `NODE_ENV` | `development`, `test` ou `production` |
| `JWT_SECRET` | obrigatório em produção; padrão fixo em dev e teste |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | obrigatórios em produção |
| `REPOSITORY` | `memory` ou `pg`; padrão `memory` |
| `DATABASE_URL` | obrigatório se `REPOSITORY=pg` |
| `BCRYPT_ROUNDS` | padrão 10 |
| `VOTE_GRACE_MS` | padrão 1000 |
| `HISTORY_LIMIT` | padrão 50 |
| `WEB_DIST_DIR` | opcional |

**Testes (escrever antes):**
- aplica os padrões;
- em produção, falha sem `JWT_SECRET`;
- `REPOSITORY=pg` sem `DATABASE_URL` falha;
- `PORT` não numérica falha com mensagem clara.

**Pronto quando:** nenhum outro módulo lê `process.env` diretamente.
**Commit sugerido:** `feat(server): valida configuração de ambiente com Zod`
**Notas do agente:** _pendente_

### [ ] B4 — `buildApp`, health e tratamento de erros
**Ref.:** architecture §6.3 (mapeamento de erros), §8.1.
**Fazer:**
- `apps/server/src/app.ts`: `buildApp(deps: AppDeps)`, que devolve a instância Fastify sem chamar `listen`. `AppDeps` tem `config`, `clock`, `scheduler`, `notifier`, `codeGenerator`, os repositórios e `domain: DomainApi`.
- `GET /api/health` → `{ status: 'ok' }`.
- `http/errors.ts`:
  - classe `HttpError(status, code, message)`;
  - `statusForDomainError(code)`: códigos `*_NOT_FOUND` → 404, `ROUND_EXPIRED` → 410, demais → 409;
  - error handler global: Zod → 400 `VALIDATION_ERROR`, `HttpError` → seu status, desconhecido → 500 `INTERNAL_ERROR` sem vazar a stack;
  - handler de rota inexistente → 404 em formato `ErrorDTO`.
- `http/validate.ts`: `parse(schema, data)`, que lança o erro de validação.
- `test/support/make-test-app.ts`: monta o app com doubles e repositórios em memória, aceitando sobrescritas.

**Testes (escrever antes, com `app.inject`):**
- health responde 200;
- rota inexistente → 404 `ErrorDTO`;
- cada tipo de erro vira o status e o código certos (use rotas registradas só no teste);
- erro 500 não expõe a mensagem interna.

**Pronto quando:** todas as respostas de erro seguem `ErrorDTO`.
**Commit sugerido:** `feat(server): cria app Fastify com health check e mapeamento de erros`
**Notas do agente:** _pendente_

### [ ] B5 — `AuthService`
**Ref.:** architecture §8.4.
**Fazer:** `services/auth.ts` com:
- `hashPassword` / `verifyPassword` (`bcryptjs`, número de rodadas vindo da config; nos testes, use 4 para ficarem rápidos);
- `issueAdminToken` (validade de 12h) e `issueVoterToken({ electionId, voterId })` com `jose`;
- `verifyToken(token)`, que devolve as claims tipadas ou lança `HttpError 401 INVALID_TOKEN`. Use o `Clock` injetado como `currentDate` do `jwtVerify`, para testar a expiração sem esperar;
- `login(username, password)` → token, ou `401 INVALID_CREDENTIALS`, com a **mesma** resposta para usuário inexistente e senha errada;
- `seedAdmin(username, password)` idempotente.

**Testes (escrever antes):**
- login correto devolve um token verificável com `role=admin`;
- senha errada e usuário inexistente dão o mesmo erro;
- token expira depois de 12h (avance o `FakeClock`);
- token adulterado é rejeitado;
- token de eleitor carrega `electionId` e `voterId`;
- `seedAdmin` chamado duas vezes cria um só admin.

**Pronto quando:** testes verdes; nenhuma senha em texto puro é guardada.
**Commit sugerido:** `feat(server): implementa autenticação com bcrypt e JWT`
**Notas do agente:** _pendente_

### [ ] B6 — Rotas de login e autorização por papel
**Ref.:** architecture §6.1 (`/admin/login`, `/admin/me`).
**Fazer:**
- `http/auth-plugin.ts`: *preHandlers* `requireAdmin` e `requireVoter`, que leem `Authorization: Bearer` e preenchem `request.auth` (tipado via *declaration merging* do Fastify).
- `http/auth-routes.ts`: `POST /api/admin/login` e `GET /api/admin/me`.
- Registrar as rotas no `buildApp`.

**Testes (escrever antes, com `app.inject`):**
- login válido → 200 + token;
- senha errada → 401;
- corpo inválido → 400;
- `/me` sem token → 401;
- `/me` com token de admin → dados do admin;
- `/me` com token de eleitor → 403.

**Pronto quando:** testes verdes.
**Commit sugerido:** `feat(server): adiciona login de admin e proteção de rotas por papel`
**Notas do agente:** _pendente_

---

## Servidor — casos de uso e rotas

> Até o marco M1 (A1–A14 prontas na `main`), os testes usam um **domínio stub** (`test/doubles/stub-domain.ts`, criado na B7a). Ele é injetado em `AppDeps.domain`. A B16a troca para o domínio real.

### [ ] B7a — `ElectionService`: o fluxo padrão de comandos
**Ref.:** architecture §8.2.
**Fazer:**
- `test/doubles/stub-domain.ts`: `createStubDomain(overrides?)`. Por padrão, cada função de comando devolve `ok(eleição recebida)` e `closeRoundIfDue` devolve a mesma eleição. Os testes sobrescrevem funções específicas com `vi.fn`.
- `services/election-service.ts`: método privado e genérico `execute(actor, electionId, command)`, que:
  1. carrega o registro (404 `ELECTION_NOT_FOUND`);
  2. verifica o dono (403);
  3. aplica `closeRoundIfDue`;
  4. aplica o comando;
  5. se o resultado for erro, lança `DomainError`;
  6. empilha o snapshot (`pushSnapshot`, limite `HISTORY_LIMIT`);
  7. salva com a versão esperada;
  8. reagenda ou cancela o fechamento (chave `round:<electionId>`, no `deadline + VOTE_GRACE_MS` da rodada aberta, se houver);
  9. notifica.

  O `DomainContext` usa `clock.now()` e um gerador de ids (`crypto.randomUUID` injetável).
- A notificação ainda é simples: `notifier.adminState(electionId, <placeholder>)`. A B7b troca pelos DTOs reais.

**Testes (escrever antes, com `SpyNotifier`, `FakeScheduler` e stub do domínio):**
- eleição inexistente → 404;
- admin de outra eleição → 403;
- erro do domínio é propagado e **nada é salvo nem notificado**;
- sucesso salva com a versão incrementada e notifica o admin;
- com rodada aberta, agenda o fechamento; sem rodada aberta, cancela;
- o snapshot anterior é empilhado.

**Pronto quando:** testes verdes; o fluxo está num único lugar.
**Commit sugerido:** `feat(server): implementa fluxo padrão de comandos do ElectionService`
**Notas do agente:** _pendente_

### [ ] B7b — Apresentadores: `AdminElectionDTO` e `VoterStateDTO`
**Ref.:** architecture §6.3, §7.
**Fazer:**
- `services/presenters.ts`: `toAdminElectionDTO(record, now, domain)` e `toVoterStateDTO(record, voterId, now, domain)`. O cálculo de resultado e das visões fica no domínio (`computeResult`, `nextPositionStatus` e as visões por papel). O apresentador só monta o DTO e adiciona `serverNow`, `canUndo`, `votedCount` e `eligibleCount`.
- O `execute` da B7a passa a notificar `adminState` com o DTO real e `voterState` para cada eleitor credenciado da eleição.

**Testes (escrever antes):**
- `serverNow` reflete o relógio;
- `canUndo` é falso sem histórico e verdadeiro com histórico;
- progresso x/y da rodada aberta;
- o DTO de eleitor **nunca** contém códigos de outros eleitores nem contagem de votos antes da liberação (use o stub do domínio para produzir os dados);
- depois de um comando, cada eleitor recebe o próprio estado.

**Pronto quando:** testes verdes.
**Commit sugerido:** `feat(server): monta DTOs de admin e eleitor e notifica após comandos`
**Notas do agente:** _pendente_

### [ ] B8 — Rotas de eleição
**Ref.:** architecture §6.1 (`/elections`, `/elections/:id`).
**Fazer:**
- `ElectionService`: `createElection` (sem carregar nada antes), `listElections(adminId)`, `getElection` (aplica `closeRoundIfDue` e, se mudar algo, salva e notifica) e `updateElection`.
- `http/election-routes.ts`: as 4 rotas, todas com `requireAdmin`.

**Testes (escrever antes, com `app.inject`):**
- criar → 201 + DTO;
- listar mostra só as eleições do admin logado;
- obter eleição de outro admin → 403;
- obter id inexistente → 404;
- PATCH com nome vazio → 400;
- rotas sem token → 401.

**Commit sugerido:** `feat(server): adiciona rotas de criação, listagem e edição de eleições`
**Notas do agente:** _pendente_

### [ ] B9 — Rotas de cargos e fila
**Ref.:** architecture §6.1 (`positions`, `queue`, `queue/suggestion`).
**Fazer:** métodos no serviço e `http/position-routes.ts`: criar, editar e remover cargo; `PUT /queue` (aplica a ordem); `GET /queue/suggestion` (só leitura, chama `suggestOrder`, não salva).
**Testes (escrever antes):**
- cada rota chama a função certa do domínio com os argumentos validados (verifique com o stub);
- `tiebreak` inválido → 400;
- erro do domínio (ex.: remover cargo fora de `DRAFT`) → 409;
- `suggestion` não salva nem notifica.

**Commit sugerido:** `feat(server): adiciona rotas de cargos e ordem de votação`
**Notas do agente:** _pendente_

### [ ] B10 — Rotas de candidatos
**Ref.:** architecture §6.1 (`candidates`, anexar candidato existente).
**Fazer:** criar, editar e remover candidato; `POST /positions/:pid/candidates/:cid`.
**Testes (escrever antes):**
- 201 na criação;
- `firstChoicePositionId` fora de `applications` → 400 (schema);
- erro de domínio `CANDIDATE_ALREADY_ELECTED` ao anexar → 409;
- remover candidato inexistente → 404.

**Commit sugerido:** `feat(server): adiciona rotas de candidatos`
**Notas do agente:** _pendente_

### [ ] B11 — Credenciamento de eleitores e gerador de códigos
**Ref.:** architecture §5.5 (formato do código), §6.1 (`voters`).
**Fazer:**
- `adapters/crypto-code-generator.ts`: usa o gerador puro do domínio (A7) com `crypto.randomInt` como fonte de aleatoriedade. Se a A7 ainda não estiver pronta, implemente aqui o mesmo alfabeto e tamanho e registre nas notas para unificar depois.
- **Unicidade global:** o eleitor entra só com o código, então o código não pode existir em nenhuma eleição. O serviço gera N códigos, confere cada um com `repo.isCodeTaken` (e contra os já gerados na mesma leva) e passa ao domínio um gerador que devolve exatamente esses códigos.
- Rotas `POST /voters` (devolve `codes` + DTO) e `DELETE /voters/:vid` (revoga).

**Testes (escrever antes):**
- gerador: tamanho 8, só caracteres do alfabeto (verificar a propriedade, sem depender de sorte);
- colisão: com o `StubCodeGenerator` devolvendo um código já usado, o serviço descarta e usa o próximo;
- `count` 0 ou 501 → 400;
- revogar → o eleitor fica `REVOKED` no DTO.

**Commit sugerido:** `feat(server): credencia eleitores com códigos únicos e aleatórios`
**Notas do agente:** _pendente_

### [ ] B12a — Rotas do ciclo de votação (parte 1)
**Ref.:** architecture §5.3, §6.1.
**Fazer:**
- `POST /open` (abre a eleição);
- `GET /next` (só leitura);
- `POST /rounds` (abre rodada; `durationSeconds` padrão = `defaultVotingSeconds` da eleição);
- `POST /rounds/:rid/close` (fechamento manual).

**Testes (escrever antes):**
- abrir rodada agenda o fechamento no `FakeScheduler` para `deadline + VOTE_GRACE_MS`;
- fechar manualmente cancela o agendamento;
- abrir uma segunda rodada com outra aberta → 409 (erro vindo do domínio);
- `next` não salva.

**Commit sugerido:** `feat(server): adiciona rotas para abrir eleição e conduzir rodadas`
**Notas do agente:** _pendente_

### [ ] B12b — Rotas do ciclo de votação (parte 2)
**Ref.:** architecture §5.4 (candidatos insuficientes, resiliência), §6.1.
**Fazer:**
- `POST /positions/:pid/runoff`;
- `POST /rounds/:rid/release`;
- `POST /positions/:pid/defer`;
- `POST /positions/:pid/cancel` (corpo `{ confirmTitle }`);
- `POST /rounds/:rid/annul`;
- `POST /undo`;
- `POST /finish`.

`undo` é especial: em vez de um comando do domínio sobre a eleição, aplica `undo` sobre o histórico do registro. Sem histórico → 409 `NOTHING_TO_UNDO`. O `undo` **não** empilha um novo snapshot.

**Testes (escrever antes):**
- `cancel` sem `confirmTitle` → 400;
- `undo` restaura a versão anterior e notifica;
- `undo` sem histórico → 409;
- depois de `undo` que reabre uma rodada, o fechamento é reagendado;
- `release` notifica os eleitores.

**Commit sugerido:** `feat(server): adiciona rotas de segundo turno, liberação, adiamento, cancelamento e desfazer`
**Notas do agente:** _pendente_

### [ ] B13a — Sessão e estado do eleitor
**Ref.:** architecture §6.2.
**Fazer:**
- `services/voter-service.ts`:
  - `startSession(code)`: normaliza o código e usa `findByVoterCode`; código inexistente → 404 `INVALID_CODE`; eleitor revogado → 403 `VOTER_REVOKED`; caso contrário, devolve o token de eleitor;
  - `getState(voterId, electionId)`: aplica `closeRoundIfDue` (salvando e notificando se mudar algo) e devolve `toVoterStateDTO`.
- Rotas `POST /api/voter/session` (pública) e `GET /api/voter/state` (`requireVoter`).

**Testes (escrever antes):**
- código válido → token com `role=voter`;
- código em minúsculas também funciona;
- código inexistente → 404;
- revogado → 403;
- `/voter/state` com token de admin → 403;
- prazo vencido é fechado ao consultar o estado.

**Commit sugerido:** `feat(server): adiciona entrada do eleitor por código e consulta de estado`
**Notas do agente:** _pendente_

### [ ] B13b — Registro de votos
**Ref.:** architecture §5.4 (votação), §6.2, §8.3.
**Fazer:**
- `VoterService.castVote(voterId, electionId, roundId, choice)`: usa o mesmo fluxo da B7a, mas a autorização é do eleitor, não do dono.
- Tolerância de prazo: o `DomainContext` do voto usa `now = clock.now() - VOTE_GRACE_MS`.
- Rota `POST /api/voter/votes` → 204.

**Testes (escrever antes):**
- voto aceito → 204, e o admin é notificado com o progresso;
- voto repetido → 409;
- voto até 1s depois do prazo ainda é aceito;
- voto 2s depois → 410;
- eleitor de outra eleição não vota nesta rodada (403);
- quando o domínio fecha a rodada (todos votaram), o agendamento é cancelado.

**Commit sugerido:** `feat(server): registra votos com tolerância de prazo`
**Notas do agente:** _pendente_

### [ ] B14 — Fechamento automático no prazo
**Ref.:** architecture §8.3.
**Fazer:**
- `adapters/timeout-scheduler.ts`: implementa `Scheduler` com `setTimeout`. Limita o atraso a 2³¹−1 ms, aceita atraso negativo (dispara logo), reagendar a mesma chave substitui a tarefa anterior e expõe `cancelAll()` para o desligamento.
- `ElectionService.handleDeadline(electionId)` é o callback agendado: carrega, aplica `closeRoundIfDue`, e salva e notifica só se algo mudou. Erros são registrados em log, sem derrubar o processo.

**Testes (escrever antes):**
- `TimeoutScheduler` com `vi.useFakeTimers()`: dispara no tempo certo, `cancel` impede, reagendar substitui;
- `handleDeadline` com `FakeClock` + stub do domínio: fecha e notifica quando venceu; não salva quando nada mudou.

**Commit sugerido:** `feat(server): fecha rodadas automaticamente ao fim do prazo`
**Notas do agente:** _pendente_

### [ ] B15 — Tempo real com Socket.IO
**Ref.:** architecture §7.
**Fazer:**
- `realtime/gateway.ts`: `attachRealtime(httpServer, deps)` → instância `io`, tipada com os eventos do `shared`.
  - Middleware de handshake: valida `auth.token` com o `AuthService`; token inválido recusa a conexão.
  - Eleitor entra automaticamente nas salas `voters:<eid>` e `voter:<vid>`.
  - Admin emite `admin:watch { electionId }`; o servidor verifica o dono, coloca o socket na sala `admin:<eid>` e emite `admin:state` na hora.
- `adapters/socket-notifier.ts`: implementa `Notifier` emitindo para as salas certas.

**Testes (escrever antes, integração com `socket.io-client` real e servidor em `listen({ port: 0 })`):**
- conexão sem token ou com token inválido recebe `connect_error`;
- admin que assiste a própria eleição recebe `admin:state`;
- admin assistindo eleição alheia não entra na sala;
- `SocketNotifier.voterState` chega só ao eleitor certo;
- um voto via HTTP gera `admin:state` no socket do admin.

Use um helper `waitForEvent(socket, nome, timeoutMs)` baseado em Promise, **sem `sleep`**. Feche os sockets e o servidor no `afterEach`.

**Commit sugerido:** `feat(server): adiciona gateway Socket.IO autenticado e notificador`
**Notas do agente:** _pendente_

---

## Integração, persistência e produção

### [ ] B16a — Integração com o domínio real (fluxo básico)
**Depende de:** A1–A14 de A na `main` (marco M1). Confira se `packages/domain/test/public-api.test.ts` não lista mais essas funções como não implementadas.
**Fazer:**
- `buildApp` passa a usar o domínio real por padrão. O stub continua disponível para os testes de unidade que já o usam.
- `test/integration/election-flow.test.ts`, um cenário só por HTTP com o domínio real:
  1. login;
  2. criar eleição, 1 cargo e 2 candidatos;
  3. gerar 3 códigos e abrir a eleição;
  4. 3 sessões de eleitor;
  5. abrir rodada e registrar 3 votos;
  6. a rodada fecha sozinha (todos votaram);
  7. o resultado aparece para o admin e o eleitor ainda não o vê;
  8. liberar → o eleitor vê `RESULTS`.

  Escreva-o em passos pequenos e nomeados (funções auxiliares), para não virar um teste gigante e ilegível.
- Corrigir divergências reais entre o servidor e o domínio. Se a divergência estiver no domínio, avise o usuário/A.

**Commit sugerido:** `test(server): integra servidor ao domínio real com cenário de votação completo`
**Notas do agente:** _pendente_

### [ ] B17 — Repositórios PostgreSQL
**Ref.:** architecture §8.1, §13.
**Fazer:**
- `adapters/pg/migrate.ts`: `migrate(pool)` idempotente (`CREATE TABLE IF NOT EXISTS`) com:
  - `admins(id, username UNIQUE, password_hash)`;
  - `elections(id, admin_id, version, record JSONB)`;
  - `voter_codes(code PRIMARY KEY, election_id, voter_id)`.
- `PgElectionRepository`:
  - `save` em transação: `UPDATE ... WHERE id = $1 AND version = $2`; 0 linhas afetadas → `VERSION_CONFLICT`. Na mesma transação, reescreve os `voter_codes` da eleição;
  - `get` reconstrói o registro a partir do JSONB.
- `PgAdminRepository`.

**Testes (escrever antes):**
- rodar a mesma `describeElectionRepositoryContract` da B2 contra o Pg, com `pg-mem` (`newDb().adapters.createPg()`);
- `migrate` duas vezes não falha;
- código duplicado entre eleições é rejeitado pelo banco.

**Commit sugerido:** `feat(server): persiste eleições no PostgreSQL com JSONB e concorrência otimista`
**Notas do agente:** _pendente_

### [ ] B18 — Composição, arquivos estáticos e retomada após reinício
**Ref.:** architecture §8.3, §13.
**Fazer:**
- `src/compose.ts`: `createServer(config)` monta os adaptadores reais conforme `REPOSITORY`, roda `migrate` (se for pg), executa `seedAdmin`, chama `buildApp` e `attachRealtime`, e reagenda as rodadas abertas (`rescheduleOpenRounds`, usando `repo.listAll()`).
- `src/main.ts` (humilde, fora da cobertura): `loadConfig(process.env)` → `createServer` → `listen`, com encerramento gracioso em `SIGTERM`/`SIGINT`.
- `http/static.ts`: `registerStatic(app, distDir)` com `@fastify/static`. Fallback para `index.html` em rotas que não são `/api` nem `/socket.io`; `/api/*` inexistente continua sendo 404 JSON.

**Testes (escrever antes):**
- `registerStatic` com diretório temporário: `/` devolve o `index.html`; `/admin/eleicoes/x` também (fallback); `/api/nada` devolve 404 JSON;
- `rescheduleOpenRounds` agenda só as eleições com rodada aberta;
- `createServer` com `REPOSITORY=memory` sobe e responde `/api/health` (via `inject`).

**Commit sugerido:** `feat(server): compõe aplicação real, serve o frontend e retoma prazos após reinício`
**Notas do agente:** _pendente_

### [ ] B20 — Build de produção
**Ref.:** architecture §13, §14.
**Fazer:**
- Build do servidor com `tsup`: entrada `src/main.ts`, saída `apps/server/dist/main.js`, `target node24`, empacotando os workspaces `@voto/*` (`noExternal`).
- Scripts raiz: `build` (web e depois server) e `start` (`node apps/server/dist/main.js`). O servidor serve `apps/web/dist` por padrão.
- Adicionar `npm run build` ao `ci.yml`, depois dos testes.

**Testes (escrever antes):** é uma tarefa de configuração. Verifique localmente que `npm run build` e `npm start` sobem o servidor e que `GET /api/health` e `GET /` respondem. Descreva nas notas o comando usado para conferir.
**Pronto quando:** o build passa no CI dos 3 SOs.
**Commit sugerido:** `build: gera build de produção do servidor e do frontend`
**Notas do agente:** _pendente_

### [ ] B21 — Deploy contínuo (Render + Neon)
**Ref.:** architecture §12, §13.
**Fazer:**
- `render.yaml` (Blueprint) com build `npm ci && npm run build`, start `npm start`, health check em `/api/health` e as variáveis da §13 (os valores secretos ficam fora do arquivo).
- `.github/workflows/deploy.yml`: dispara em `workflow_run` do CI com `conclusion == success` na `main` e chama `curl -fsS -X POST "$RENDER_DEPLOY_HOOK"` (secret).
- `docs/deploy.md`: checklist dos passos manuais **do usuário**:
  1. criar o banco no Neon e copiar a `DATABASE_URL`;
  2. criar o serviço no Render, definir as variáveis e desligar o auto-deploy;
  3. criar o secret `RENDER_DEPLOY_HOOK` no GitHub;
  4. conferir `/api/health` em produção.

**Testes (escrever antes):** não se aplica (infraestrutura). A validação é o usuário seguir o checklist e a URL de produção responder.
**Pronto quando:** o usuário confirmar a aplicação no ar (marco M2). Registre a URL nas notas.
**Commit sugerido:** `ci: publica em produção no Render após CI verde na main`
**Notas do agente:** _pendente_

### [ ] B16b — Integração com o domínio real (cenários avançados)
**Depende de:** A15–A20 de A na `main`.
**Fazer:** novos testes de integração só por HTTP com o domínio real, um arquivo por cenário:
- 2º turno: 3 candidatos e votos divididos → `AWAITING_RUNOFF` → `runoff` → eleito;
- exclusão do eleito: eleito no cargo A não aparece na cédula do cargo B;
- candidatos insuficientes: `next` → `INSUFFICIENT_CANDIDATES` → anexar existente / adiar / cancelar;
- resiliência: `undo` depois de liberar o resultado; `annul` de uma rodada;
- persistência: o mesmo fluxo básico com o `PgElectionRepository` sobre `pg-mem`.

**Commit sugerido:** `test(server): cobre segundo turno, candidatos insuficientes e desfazer com domínio real`
**Notas do agente:** _pendente_

### [ ] B23 — Revisão final da parte B
**Ref.:** architecture §10.3; aula 11 (test smells).
**Fazer:**
- Revisar a suíte do servidor procurando *test smells* (Assertion Roulette, Conditional Test Logic, Magic Number, Mystery Guest, General Fixture, Sleepy Test, testes ignorados) e corrigir.
- Garantir cobertura ≥ 85% no `apps/server` e ≥ 80% no `shared`.
- `docs/api.md`: referência curta das rotas e eventos, com exemplo de requisição e resposta. Atualizar o `architecture.md` onde a implementação divergiu (com aprovação do usuário).
- Escrever no README as subseções da parte B (Tecnologias do backend/CI; Execução dos testes: comandos).

**Commit sugerido:** `docs(server): documenta API e refina suíte de testes do servidor`
**Notas do agente:** _pendente_

---

## Decisões e desvios

> Registro, mantido pelo agente, de decisões aprovadas pelo usuário que mudam ou detalham o `architecture.md`. Formato: `AAAA-MM-DD — tarefa — decisão — motivo`.

- 2026-11-22 — planejamento — o repositório guarda `ElectionRecord = History<Election>` (atual + snapshots), não só a `Election`. Assim o desfazer sobrevive a reinícios. Detalha a §8.1.
- 2026-11-22 — planejamento — os códigos de eleitor são **únicos globalmente**, não só por eleição, porque o eleitor entra apenas com o código. Garantido pelo serviço (B11) e pela chave primária de `voter_codes` (B17). Detalha a §5.5.
- 2026-11-22 — planejamento — o domínio é injetado no servidor (`AppDeps.domain: DomainApi`) para permitir stubs antes do marco M1.
