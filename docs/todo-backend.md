# TO-DO — Integrante B (Sprint 0 + Backend + Infraestrutura)

Este arquivo é a **memória de trabalho do agente de IA** da parte B. Ele lista, em ordem, tudo o que precisa existir para a parte B ficar implementada e testada, partindo de um repositório vazio. Também registra, tarefa a tarefa, o que já foi feito.

Documentos de referência (leia as seções citadas em cada tarefa):
- [architecture.md](architecture.md): stack, arquitetura, contratos (§5 domínio, §6 REST, §7 socket, §8 backend, §10 testes, §12 CI, §13 deploy).
- [divisao-tarefas.md](divisao-tarefas.md): o que é de A, B e C, e as regras de convivência.
- `CLAUDE.md` (raiz): como codar (TDD, convenções). Tem prioridade sobre este arquivo em caso de conflito.
- [todo-domain.md](todo-domain.md): notas de A sobre o domínio. **Leia as "Notas do agente" e a seção "Decisões e desvios" sempre que for chamar uma função do domínio.**

> **Contexto (2026-11-23).** O domínio (`packages/domain`, parte A) **já está implementado** (A1–A24: 205 testes, cobertura ~97%) e foi criado antes do Sprint 0 como pacote autocontido (TypeScript 7, Vitest 5, StrykerJS). Consequências para este TO-DO:
> - O Sprint 0 **integra** esse pacote ao monorepo em vez de criar o domínio do zero (S0.4 mudou).
> - O servidor usa **o domínio real desde a B1**, sem stub. É o que o material da disciplina recomenda: implementação real > fake > stub > mock.
> - **As assinaturas reais do domínio valem mais que a §5.2 do `architecture.md`.** Onde divergem, siga `packages/domain/src/index.ts` e o `todo-domain.md`. Exemplos: `openRound(e, { positionId, durationSeconds? }, ctx)`, `castVote(e, { roundId, voterId, choice }, ctx)`, `closeRound(e, roundId)`, `cancelPosition(e, positionId, confirmTitle)`, `createElection(...)` devolve `Result`.
> - Os builders de teste do domínio (`packages/domain/test/builders`) **não** são exportados. No servidor, monte o estado chamando os comandos públicos do domínio (helper em `apps/server/test/support/`, B7a).

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
7. **Pastas.** A parte B é dona da raiz do monorepo, de `packages/shared`, `apps/server`, `.github/` e dos arquivos de deploy. `packages/domain` é de A e `apps/web` é de C. Depois do Sprint 0, não altere essas pastas. **Exceção combinada:** na S0.1, S0.2 e S0.3a, o agente pode mexer só na **configuração** do `packages/domain` (`package.json`, `tsconfig.json`, `.gitignore`, formatação automática) e trocar o conteúdo de `src/model.ts` por uma reexportação. Nenhuma regra de negócio ou teste do domínio é alterado; avise A no resumo.

**Modelo das Notas do agente** (substitua o `_pendente_`):

```
- Feito: <1–2 linhas sobre o que passou a existir>
- Arquivos: <caminhos principais>
- Como usar: <assinatura/rota/comando que os próximos passos vão chamar>
- Testes: <arquivo(s) de teste e quantidade de testes>
- Decisões: <escolhas não óbvias; "nenhuma" se não houver>
```

**Git.** O agente **não** roda `git commit`, `git push` nem cria branches: o usuário cuida disso. Para referência: as tarefas do Sprint 0 vão direto na `main`; a partir da B1, o usuário usa uma branch por bloco de tarefas (ex.: `feat/server-fundacoes`, `feat/server-votacao`), com um commit por tarefa, e abre um PR por bloco. Na S0.1, o agente pode rodar `git init` só se o repositório ainda não existir.

---

## Mapa rápido do código

> Mantido pelo agente. Uma linha por módulo importante: caminho → para que serve.

- `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json` → raiz do monorepo (scripts `lint`, `format`, `format:check`, `typecheck`; regra de direção de imports no ESLint).
- `vitest.shared.ts` → `coverageConfig(exclude?)`: cobertura v8, lcov e limite de 80%, usada por todo `vitest.config.ts`.
- `packages/shared/src/index.ts` → API pública do `shared` (`APP_NAME` + reexporta o resto).
- `packages/shared/src/dto.ts` → tipos do agregado (`Election`, `Round`...), `BLANK` e DTOs da API (`AdminElectionDTO`, `VoterStateDTO`, `RoundResultDTO`, `RoundView`, `NextPositionDTO`, `ElectionSummaryDTO`, `ErrorDTO`).
- `packages/shared/src/error-codes.ts` → `ERROR_CODES` (domínio + servidor) e `ErrorCode`.
- `packages/shared/src/api-schemas.ts` → schemas Zod dos corpos de requisição (§6.1/§6.2) e tipos inferidos.
- `packages/shared/src/socket-events.ts` → `SOCKET_EVENTS` e tipos `ServerToClientEvents` / `ClientToServerEvents`.
- `packages/domain/src/model.ts` → só reexporta os tipos do agregado de `@voto/shared`.
- `apps/web/src/App.tsx` → `App`: tabela de `Routes` (hoje só `/` com o título); o roteador vem de fora.
- `apps/web/src/main.tsx` → composição (`BrowserRouter` + `createRoot`); fora da cobertura.
- `apps/web/vite.config.ts` → plugin React, proxy `/api` e `/socket.io` e config do Vitest (jsdom, setup, cobertura).
- `apps/web/test/setup.ts` → setup do Testing Library (`jest-dom` + `cleanup`).
- `apps/server/src/config.ts` → `loadConfig(env)`: valida o ambiente com Zod e devolve `Config` (único lugar que lê variáveis de ambiente).
- `apps/server/src/http/error-status.ts` → `statusForErrorCode(code)`: código de erro → status HTTP (§6.3).
- `apps/server/src/ports/` → portas da aplicação (só tipos): repositórios, `Clock`, `Scheduler`, `CodeGenerator`, `Notifier`, `Logger`; `index.ts` reexporta tudo.
- `apps/server/test/doubles/` → `FakeClock`, `FakeScheduler`, `SpyNotifier`, `SpyLogger`, `StubCodeGenerator` (cada um com teste próprio).
- `apps/server/src/adapters/` → `InMemoryElectionRepository` e `InMemoryAdminRepository` (cópias com `structuredClone`, índice de códigos de eleitor); `repository-errors.ts` → erros comuns aos repositórios.
- `apps/server/src/adapters/pg/` → repositórios PostgreSQL: `migrate(pool)`, `PgElectionRepository`, `PgAdminRepository`, `inTransaction(pool, work)` e a porta `SqlPool` (`sql.ts`).
- `apps/server/test/doubles/pg-mem-pool.ts` → Postgres em memória com rollback (`createPgMemPool`, `createMigratedPgMemPool`); `spy-sql-pool.ts` → anota comandos e liberações de conexão.
- `apps/server/test/doubles/held-save-election-repository.ts` → segura (e libera ou faz falhar) a próxima gravação, para o teste agir enquanto ela está em andamento.
- `apps/server/test/doubles/gated-reads-election-repository.ts` → segura as próximas leituras até todas chegarem, para forçar disputa de versão entre requisições.
- `apps/server/test/doubles/failing-save-election-repository.ts` → `FailingSaveElectionRepository`: as próximas gravações falham com os erros de `pendingFailures` (e rodam `onFailure`), para testar as novas tentativas do serviço.
- `apps/server/test/support/pending-work.ts` → `flushPendingWork()`: deixa as promessas pendentes andarem (próxima volta do event loop), sem espera por tempo.
- `apps/server/src/http/errors.ts` → `HttpError(status, code, message)`.
- `apps/server/src/app.ts` → `AppDeps` e `buildApp(deps)` (Fastify sem `listen`; health e tratadores de erro).
- `apps/server/src/http/error-handler.ts` → `toErrorResponse(error)` e `registerErrorHandling(app)`: `HttpError`/`DomainError`/`ZodError`/erro do Fastify → `ErrorDTO`.
- `apps/server/src/http/validate.ts` → `parse(schema, data)` (lança `ZodError`).
- `apps/server/src/http/json-body.ts` → `registerLenientJsonBody(app)`: corpo JSON vazio vale como ausente (o front manda `Content-Type: application/json` em todo POST).
- `apps/server/test/support/make-test-app.ts` → `makeTestApp(overrides?)`: app com doubles e repositórios em memória.
- `apps/server/test/contracts/` → suítes de contrato de `ElectionRepository` e `AdminRepository`, rodadas contra a memória e o Postgres.
- `apps/server/src/services/auth.ts` → `AuthService` (bcrypt + JWT: `login`, `verifyToken`, `issueAdminToken`, `issueVoterToken`, `seedAdmin`).
- `apps/server/test/support/election-records.ts` → `anElectionRecord(...)` e `unwrap(result)` para montar registros com o domínio real.
- `apps/server/src/http/auth-plugin.ts` → `registerAuth(app, auth)` (`requireAdmin`, `requireVoter`, `request.auth`) e `getAdminId(request)`.
- `apps/server/src/http/auth-routes.ts` → `registerAuthRoutes`: `POST /api/admin/login`, `GET /api/admin/me`.
- `apps/server/src/http/rate-limit.ts` → `registerRateLimit(app, clock)` (feito pelo A na A25): janela fixa por rota e por `request.ip` (10 logins/min, 60 entradas de eleitor/min); acima disso, 429 `RATE_LIMITED` com `Retry-After`. Ligado no `buildApp` só se `config.rateLimit`.
- `apps/server/src/services/election-service.ts` → `ElectionService`: fluxo único `execute`/`commit` (§8.2) e comandos do admin (eleição, cargos, fila, candidatos, `credentialVoters`, `revokeVoter`, `openRound`); notifica admin e eleitores via apresentadores.
- `apps/server/src/http/admin-route-deps.ts` → `AdminRouteDeps` (serviço, relógio e hooks das rotas de admin sobre eleições) e `ElectionParams` (`:id`), compartilhados pelas 4 rotas abaixo.
- `apps/server/src/http/election-routes.ts` → `registerElectionRoutes`: `GET/POST /api/elections`, `GET/PATCH /api/elections/:id`.
- `apps/server/src/http/position-routes.ts` → `registerPositionRoutes`: `POST/PATCH/DELETE .../positions[/:pid]`, `PUT .../queue`, `GET .../queue/suggestion`.
- `apps/server/src/http/candidate-routes.ts` → `registerCandidateRoutes`: `POST .../candidates`, `PATCH/DELETE .../candidates/:cid`, `POST .../positions/:pid/candidates/:cid`.
- `apps/server/src/http/voter-routes.ts` → `registerVoterRoutes`: `POST .../voters` (gera códigos) e `DELETE .../voters/:vid` (revoga).
- `apps/server/src/http/round-routes.ts` → `registerRoundRoutes`: `POST .../open`, `GET .../next`, `POST .../rounds`, `POST .../rounds/:rid/close`.
- `apps/server/src/http/resolution-routes.ts` → `registerResolutionRoutes`: `POST .../positions/:pid/{runoff,defer,cancel}`, `.../rounds/:rid/{release,annul}`, `.../undo`, `.../finish`.
- `apps/server/src/services/keyed-queue.ts` → `KeyedQueue`: fila em memória por chave; o `ElectionService` a usa para gravar uma eleição de cada vez.
- `apps/server/src/services/voter-service.ts` → `VoterService`: `startSession(code)` (token do eleitor), `getState(voterId, electionId)` (aplica prazo vencido e devolve o `VoterStateDTO`) e `castVote(voterId, electionId, vote)`.
- `apps/server/src/http/voter-access-routes.ts` → `registerVoterAccessRoutes`: `POST /api/voter/session` (pública), `GET /api/voter/state` e `POST /api/voter/votes` (`requireVoter`).
- `apps/server/src/adapters/timeout-scheduler.ts` → `TimeoutScheduler`: `Scheduler` com `setTimeout` (uma tarefa por chave, prazos longos em etapas, `cancelAll()`).
- `apps/server/src/adapters/crypto-code-generator.ts` → `createCryptoCodeGenerator()`: gerador do domínio com `crypto.randomInt`.
- `apps/server/src/compose.ts` → `createServer(config, { createPool? })`: monta o servidor real (repositórios, adaptadores de produção, Socket.IO, seed do admin, estáticos) e o devolve `ready`; o `close` cancela timers e encerra o pool.
- `apps/server/src/main.ts` → humilde (fora da cobertura): `loadConfig(process.env)` → `createServer` → `listen` e encerramento em `SIGTERM`/`SIGINT`.
- `apps/server/src/http/static.ts` → `registerStatic(app, distDir)`: build do front com fallback para `index.html` (só `GET`, fora de `/api` e `/socket.io`).
- `apps/server/src/adapters/system-clock.ts` → `systemClock`: `Clock` de produção.
- `apps/server/tsup.config.ts` → build de produção do servidor (`dist/main.js`, ESM, empacota os `@voto/*`). Scripts raiz: `build` (web e depois server) e `start` (`cross-env WEB_DIST_DIR=apps/web/dist node apps/server/dist/main.js`).
- `apps/server/test/doubles/pg-mem-pool.ts` → também `createPgMemDatabasePool()`: pool com `on('error')`/`emit` e `end` (recusa uso depois), para os testes do `createServer`.
- `apps/server/src/services/presenters.ts` → `toAdminElectionDTO(record, now)`, `toVoterStateDTO(election, voterId, now)` e `toElectionSummaryDTO(election)`.
- `apps/server/test/support/admin-test-app.ts` → `appWithTwoAdmins(overrides?)`: app de teste com os cabeçalhos `asAna`/`asBia` (ids `ANA`/`BIA`), fechado sozinho ao fim do teste (`onTestFinished`).
- `apps/server/src/realtime/gateway.ts` → `createRealtimeServer()`, `attachRealtime(io, httpServer, deps)` (handshake JWT, salas do eleitor, `admin:watch`), tipos `RealtimeServer`/`RealtimeDeps`; `rooms.ts` → nomes das salas.
- `apps/server/src/adapters/socket-notifier.ts` → `SocketNotifier(io)`: `Notifier` que emite `admin:state`/`voter:state` para as salas.
- `apps/server/test/support/realtime-test-app.ts` → `startRealtimeApp()` (app em porta efêmera com gateway real) e helpers `connected`, `waitForEvent`, `waitForConnectError`, `collectEvents`.
- `apps/server/test/support/election-fixtures.ts` → `openElectionWithVoters(...)`: eleição aberta montada com o domínio real.
- `.github/workflows/ci.yml` → CI (matriz de 3 SOs: lint, format, typecheck, cobertura; upload Codecov por flag só no Ubuntu; no fim, upload do `e2e/playwright-report/` quando o job falha, da A26). Os passos de e2e (C22) entram **antes** desse upload.
- `docs/setup-repositorio.md` → passos manuais do usuário (Codecov, secret, proteção da `main`).
- `render.yaml` → Blueprint do Render (serviço web único, auto-deploy desligado, variáveis da §13).
- `.github/workflows/deploy.yml` → após o CI verde em push na `main`, chama o Deploy Hook do Render com o SHA aprovado.
- `docs/deploy.md` → checklist manual do deploy (Neon, Render, secret, conferências em produção).
- `packages/domain/vitest.stryker.config.ts` → config do Vitest usada só pelo StrykerJS (sem cobertura).
- `packages/domain/tsconfig.stryker.json` → config do TS usada pelo StrykerJS.

---

## Sprint 0 — Base comum

O objetivo do Sprint 0 é que C abra o projeto e só "preencha os vazios", e que o domínio já pronto de A rode dentro do monorepo: tudo compila, todo workspace tem testes rodando e o CI está verde.

**Ponto de partida:** a `main` com o merge da branch `feat/domain` (que já contém os docs e o `packages/domain`).

### [x] S0.1 — Monorepo, TypeScript e qualidade de código
**Ref.:** architecture §2, §3 (regra de direção de imports), §4, §14.
**Fazer:**
- Inicializar o git se ainda não existir. Criar `.gitignore` (`node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `.env*`), `.gitattributes` com `* text=auto eol=lf` (evita quebras do Prettier no Windows), `.editorconfig` e `.nvmrc` com `24`.
- Mover o conteúdo atual do `README.md` (requisitos do sistema) para `docs/requisitos.md`. Criar um `README.md` novo só com os títulos exigidos pelo enunciado (Integrantes, Sobre o sistema, Tecnologias, Uso de IA, Execução dos testes), com marcadores "a preencher".
- `package.json` raiz: `private`, `"type": "module"`, `engines.node >= 24`, `workspaces: ["packages/*", "apps/*"]`. O C adiciona `e2e` mais tarde.
- `.npmrc` com `engine-strict=true`, para o `npm install` falhar logo se alguém estiver com o Node errado (o "ambiente" do projeto é: Node fixado no `.nvmrc` + dependências locais em `node_modules` travadas pelo `package-lock.json`; não há venv nem Docker).
- `tsconfig.base.json` com as mesmas opções do `packages/domain/tsconfig.json` atual (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `module ESNext`, `moduleResolution Bundler`, `target ES2023`). O `packages/domain/tsconfig.json` passa a estender a base, mantendo só o que é dele.
- **Versões:** usar as mesmas majors que o domínio já usa: **TypeScript 7** e **Vitest 5** (+ `@vitest/coverage-v8` 5). Ferramentas comuns (TypeScript, Vitest, ESLint, Prettier) vão para os `devDependencies` da raiz; o `package.json` do domínio fica só com o que é dele (StrykerJS e scripts).
- Criar os workspaces novos `packages/shared` (`@voto/shared`) e `apps/server` (`@voto/server`), cada um com `package.json`, `tsconfig.json` e `src/index.ts` mínimo. `shared` exporta o código-fonte TS direto (`"exports": { ".": "./src/index.ts" }`), como o domínio já faz.
- **Integrar o `packages/domain`:**
  - remover o `.gitignore` provisório dele, levando para o `.gitignore` da raiz as entradas `reports/` e `.stryker-tmp/`;
  - **não** ignorar o `stryker.config.json` (hoje ele está no `.gitignore`, apesar de commitado);
  - o `stryker.config.json` aponta para um `tsconfig.stryker.json` que não existe: crie o arquivo (estendendo o `tsconfig.json` do pacote) ou remova a opção, e confirme que `npm run test:mutation -w packages/domain` ainda roda;
  - apagar o `package-lock.json` local do domínio, se houver: o único lock é o da raiz.
- ESLint (flat config, `typescript-eslint`) + Prettier. Regra `no-restricted-imports` para a direção das dependências: `shared` não importa nada de `@voto/*`; `domain` só importa `@voto/shared`; o `web` não pode importar `@voto/domain` nem `@voto/server`.
  - **Risco a verificar:** confirme que a versão instalada do `typescript-eslint` suporta TypeScript 7. Se não suportar, use a configuração sem regras que dependem de tipos (`recommended`, não `recommendedTypeChecked`) e registre em "Decisões e desvios".
- Rodar `npm run format` e `npm run lint` também no `packages/domain`. Correções de **formatação** podem ser aplicadas. Se o lint apontar problemas no código do domínio, **não reescreva a lógica**: ajuste a regra, se for de estilo, ou liste os pontos para o usuário repassar ao A.
- Scripts raiz: `lint`, `format`, `format:check`, `typecheck` (roda em todos os workspaces), todos multiplataforma.

**Testes (escrever antes):** é uma tarefa de configuração. A verificação é rodar, na raiz, `npm install`, `npm run lint`, `npm run typecheck` e `npm test -w packages/domain` (os 205 testes do domínio continuam passando). Confirme também que um import proibido (teste manual temporário, ex.: `shared` importando `@voto/domain`) é acusado pelo lint, e desfaça o import depois.
**Pronto quando:** os comandos acima passam; a estrutura bate com a §4; o domínio roda dentro do monorepo sem configuração duplicada.
**Commit sugerido:** `chore: cria monorepo com workspaces, TypeScript, ESLint e Prettier`
**Notas do agente:**
- Feito: monorepo com workspaces `domain`, `shared` e `server`; TS, ESLint (flat) e Prettier na raiz; domínio integrado sem config duplicada.
- Arquivos: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.npmrc`, `README.md` novo, `docs/requisitos.md`, `packages/{shared,domain}/*`, `apps/server/*`.
- Como usar: `npm run lint`, `npm run format[:check]`, `npm run typecheck`; `tsc` é o TS 7 e `tsc6` o TS 6 (só para o ESLint). Mutação: `npm run test:mutation -w packages/domain` (score 89,27%).
- Testes: sem testes novos (configuração). Os 205 do domínio passam; lint, format:check e typecheck verdes; import proibido (`shared`→`@voto/domain`, `domain`→`@voto/server`) acusado e depois desfeito.
- Decisões: (1) `typescript-eslint` **não** suporta TS 7 e falha ao carregar, mesmo sem regras com tipos; usei o alias oficial (ver "Decisões e desvios"). (2) Prettier ignora `*.md`, porque formatar os docs reescreveria CLAUDE.md e tabelas de outros integrantes. (3) Regra `no-unused-vars` aceita prefixo `_` (o domínio usa em 2 desestruturações). (4) Regra do `web` está no ESLint, mas não foi exercitada, pois `apps/web` só nasce na S0.5. (5) Alterações no domínio: só `package.json`, `tsconfig.json`, `tsconfig.stryker.json`, `.gitignore` removido e formatação automática do código.

### [x] S0.2 — Vitest e cobertura em cada workspace
**Ref.:** architecture §10.1, §14.
**Fazer:**
- O `packages/domain/vitest.config.ts` já existe e é o modelo: provider `v8`, reporters `text` e `lcov`, saída em `<workspace>/coverage/`, `include: ['src/**']` e thresholds de 80% (linhas, branches, funções, statements). Criar o mesmo para `shared` e `server`. No servidor, excluir `src/main.ts` da cobertura. Se quiser evitar repetição, extraia a parte comum para um `vitest.shared.ts` na raiz e faça os três usarem (inclusive o domínio, só a configuração).
- Um teste "fumaça" em `shared` e `server` (ex.: `shared` exporta `APP_NAME = 'Voto'` e o teste verifica o valor). O domínio já tem testes de verdade. Os nomes dos testes ficam em inglês e descrevem comportamento (ver CLAUDE.md).
- Scripts por workspace: `test` e `test:coverage`. Scripts raiz: `test` e `test:coverage`, que rodam em todos os workspaces com `--workspaces --if-present`.

**Testes (escrever antes):** os testes fumaça de cada workspace.
**Pronto quando:** `npm test` e `npm run test:coverage` passam na raiz e geram `coverage/lcov.info` em cada workspace.
**Commit sugerido:** `test: configura Vitest com cobertura mínima de 80% em todos os workspaces`
**Notas do agente:**
- Feito: `shared` e `server` rodam Vitest com cobertura v8 (limite de 80% nos 4 indicadores); a parte comum fica em `vitest.shared.ts` na raiz e é usada pelos 3 workspaces. `npm test` e `npm run test:coverage` rodam nos 3 e geram `coverage/lcov.info`.
- Arquivos: `vitest.shared.ts`, `{packages/domain,packages/shared,apps/server}/vitest.config.ts`, `packages/domain/vitest.stryker.config.ts`, `package.json` (raiz e workspaces), `tsconfig.json` dos 3 workspaces.
- Como usar: `coverageConfig(exclude?)` de `vitest.shared.ts` em todo `vitest.config.ts` novo (o `web`, na S0.5, usa o mesmo). No servidor, `src/main.ts` já está excluído.
- Testes: `packages/shared/test/app-name.test.ts` (1) e `apps/server/test/service-name.test.ts` (1). Domínio segue com 205.
- Decisões: (1) o `server` ganhou `SERVICE_NAME = 'voto-server'` em `src/index.ts` só para ter o que testar; sai ou é reaproveitado na B4. (2) O StrykerJS roda numa cópia em `.stryker-tmp/`, onde `../../vitest.shared` não existe, então ele usa `vitest.stryker.config.ts` (sem cobertura), apontado em `stryker.config.json`; mutação conferida em `src/ordering/queue.ts` (96%). (3) Alteração no domínio: só configuração (`vitest.config.ts`, `tsconfig.json`, `stryker.config.json`, novo `vitest.stryker.config.ts`). Avisar A. (4) O teste do `shared` já nasceu verde (`APP_NAME` existia); conferi que falha se o valor mudar.

### [x] S0.3a — Contratos: DTOs, códigos de erro e eventos de socket
**Ref.:** architecture §5.1, §6.3, §7; `packages/domain/src/model.ts`, `src/errors.ts`, `src/views/views.ts`, `src/ordering/queue.ts`.
**Fazer:**
- `packages/shared/src/dto.ts`:
  - **mover** para cá os tipos do agregado que hoje estão em `packages/domain/src/model.ts` (`Election`, `Position`, `Candidate`, `Voter`, `Round`, `TiebreakRule`, os status...), **sem mudar formato nem nomes**;
  - `packages/domain/src/model.ts` passa a ser só `export * from '@voto/shared'` (ou reexportações nomeadas), para que o código do domínio não mude;
  - adicionar os DTOs da §6.3 (`AdminElectionDTO`, `VoterStateDTO`, `RoundResultDTO`, `NextPositionDTO`, `RoundView`, `ElectionSummaryDTO`, `ErrorDTO`). Use como base os tipos que o domínio **já devolve** (`RoundResultView`, `VoterView`, `BallotView`, `NextPositionInfo`). O objetivo é que o apresentador do servidor (B7b) só acrescente `serverNow`, `canUndo` e progresso, sem converter formatos. Se for preciso divergir da §6.3, registre em "Decisões e desvios".
- `packages/shared/src/error-codes.ts`: constante `ERROR_CODES` (`as const`) e tipo `ErrorCode`, contendo:
  - **todos** os códigos de `DOMAIN_ERROR_CODES` (`packages/domain/src/errors.ts`);
  - os códigos de servidor: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `INVALID_TOKEN`, `FORBIDDEN`, `ELECTION_NOT_FOUND`, `INVALID_CODE`, `VERSION_CONFLICT`, `NOT_FOUND`, `INTERNAL_ERROR`, `RATE_LIMITED`.

  O `shared` não pode importar o domínio, então a lista é escrita aqui. A S0.4 cria o teste que garante que as duas listas não se descolem.
- `packages/shared/src/socket-events.ts`: `SOCKET_EVENTS = { ADMIN_STATE: 'admin:state', VOTER_STATE: 'voter:state', ADMIN_WATCH: 'admin:watch' }` + tipos `ServerToClientEvents` / `ClientToServerEvents` (formato do Socket.IO).
- Reexportar tudo em `src/index.ts`.

**Testes (escrever antes):** os nomes dos eventos são únicos e seguem o padrão `<papel>:<ação>`; os códigos de erro são únicos e estão em `UPPER_SNAKE_CASE`. Os tipos são validados pelo `typecheck`.
**Pronto quando:** `typecheck` e testes passam **em todos os workspaces**, inclusive os 205 testes do domínio, agora usando os tipos do `shared`.
**Commit sugerido:** `feat(shared): define DTOs, códigos de erro e eventos de tempo real`
**Notas do agente:**
- Feito: `@voto/shared` agora tem os tipos do agregado (movidos do domínio), os DTOs da §6.3, `ERROR_CODES` e os eventos de socket. O domínio reexporta os tipos de `@voto/shared` e roda com eles.
- Arquivos: `packages/shared/src/{dto,error-codes,socket-events,index}.ts`, `packages/domain/src/model.ts` (só reexporta), `packages/domain/package.json` (dependência `@voto/shared`), `package-lock.json`.
- Como usar: `import { type AdminElectionDTO, ERROR_CODES, type ErrorCode, SOCKET_EVENTS, BLANK, ... } from '@voto/shared'`. Os tipos do domínio (`BallotView`, `RoundResultView`, `NextPositionInfo`, `VoterView`) são atribuíveis a `RoundView`, `RoundResultDTO`, `NextPositionDTO` e `VoterStateDTO` (menos `serverNow`); conferi com um arquivo temporário de typecheck, já removido. O B7b só acrescenta `serverNow`, `canUndo` e o progresso.
- Testes: `packages/shared/test/error-codes.test.ts` (3 casos, 1 deles `it.each` sobre todos os códigos) e `socket-events.test.ts` (2 casos, 1 deles `it.each`); no total, 57 execuções novas, 58 no `shared`. Domínio segue com 205; `lint`, `format:check`, `typecheck` e `test:coverage` verdes; Stryker ainda roda (`queue.ts` 96%).
- Decisões: (1) `BLANK` também foi para o `shared` (o schema de voto da S0.3b precisa dele). (2) `model.ts` do domínio usa reexportação **nomeada**, não `export *`, para o `index.ts` do domínio não expor `ERROR_CODES`, `SOCKET_EVENTS` e afins. (3) `ElectionSummaryDTO` não existia na §6.3; defini `{ id, name, status, positionCount, voterCount }` (ver "Decisões e desvios"). (4) `ErrorDTO.error.code` é `ErrorCode`, não `string`. (5) `ERROR_CODES` é um array `as const` (igual a `DOMAIN_ERROR_CODES`), para a S0.4 usar `.includes`. (6) Alteração no domínio: só `model.ts` (agora reexportação) e `package.json`. Avisar A.


### [x] S0.3b — Contratos: schemas Zod dos corpos de requisição
**Ref.:** architecture §6.1, §6.2.
**Fazer:**
- `packages/shared/src/api-schemas.ts`: um schema Zod para cada corpo de requisição das tabelas §6.1 e §6.2 (login, criar/editar eleição, cargo, fila, candidato, gerar eleitores, abrir rodada, 2º turno, cancelar cargo, sessão de eleitor, voto). Exportar também os tipos inferidos (`LoginBody` etc.).
- Regras: strings sem espaços nas pontas e não vazias; `tiebreak` é enum; `age` é inteiro de 16 a 120; `remainingMonths` é inteiro ≥ 0; `count` de eleitores vai de 1 a 500; `durationSeconds` vai de 5 a 3600; `firstChoicePositionId` precisa estar em `applications` (`refine`); `code` é normalizado para maiúsculas e tem exatamente 8 caracteres; `choice` é um id não vazio ou `'BLANK'`.

**Testes (escrever antes):** para cada schema, ao menos um caso válido e os casos inválidos mais relevantes. Use `it.each` com tabela nomeada só quando forem variações do mesmo comportamento.
**Pronto quando:** todos os schemas da §6 existem e estão testados; cobertura do `shared` ≥ 80%.
**Commit sugerido:** `feat(shared): adiciona schemas Zod dos corpos da API`
**Notas do agente:**
- Feito: `@voto/shared` exporta um schema Zod por corpo de requisição das §6.1 e §6.2, com os tipos inferidos (`LoginBody`, `CreateCandidateBody`...). `zod` virou dependência do `shared` (já estava na stack, §2).
- Arquivos: `packages/shared/src/api-schemas.ts` (reexportado no `index.ts`), `packages/shared/package.json`, `package-lock.json`.
- Como usar: `loginBodySchema`, `createElectionBodySchema`, `updateElectionBodySchema`, `createPositionBodySchema`, `updatePositionBodySchema`, `queueBodySchema`, `createCandidateBodySchema`, `updateCandidateBodySchema`, `credentialVotersBodySchema`, `openRoundBodySchema`, `openRunoffBodySchema`, `cancelPositionBodySchema`, `voterSessionBodySchema`, `castVoteBodySchema`. Na B4, `parse(schema, data)` usa `schema.parse`; o `ZodError` vira 400 `VALIDATION_ERROR`.
- Testes: `packages/shared/test/api-schemas.test.ts` (80 execuções novas, sobre os 14 schemas, com limites exatos). `shared` passa de 58 para 138 execuções, com cobertura de 100%. Domínio segue com 205.
- Decisões: (1) `PATCH` usa `.partial()` do schema de criação. Em `updateCandidateBodySchema`, a regra da primeira opção só vale se `applications` e `firstChoicePositionId` chegam juntos; do contrário o domínio compara com o valor guardado. (2) A senha do login não é "trimada" (espaços podem fazer parte dela); os demais textos são. (3) `durationSeconds`, `defaultVotingSeconds`, idade e `count` repetem os limites do domínio como constantes locais, porque o `shared` não pode importá-lo. (4) `code` do eleitor só confere tamanho 8 e maiúsculas (como o TO-DO pede); código com caractere fora do alfabeto cai em 404 `INVALID_CODE` no serviço. (5) `labels` > `count` não é checado aqui: o domínio devolve `INVALID_VOTER_LABELS`. (6) `choice` não valida contra a cédula (isso é regra do domínio).

### [x] S0.4 — Servidor enxergando o domínio real
**Ref.:** architecture §3, §6.3. (A versão antiga desta tarefa criava stubs do domínio. Não é mais necessário: A já implementou a API pública.)
**Fazer:**
- `apps/server` passa a depender de `@voto/domain` e `@voto/shared` (dependências de workspace) e a importar o domínio **diretamente**, sem injeção.
- `apps/server/src/http/error-status.ts`: função pura `statusForErrorCode(code: ErrorCode): number`, com a tabela da §6.3: `*_NOT_FOUND` → 404, `ROUND_EXPIRED` → 410, validação → 400, credenciais/token → 401, `FORBIDDEN` → 403, `RATE_LIMITED` → 429, `INTERNAL_ERROR` → 500, demais erros de domínio → 409. A B4 usa essa função.

**Testes (escrever antes):**
- **contrato de erros:** todo código de `DOMAIN_ERROR_CODES` existe em `ERROR_CODES`. Esse teste fica no servidor, o único workspace que enxerga os dois;
- `statusForErrorCode`: um caso por faixa (`POSITION_NOT_FOUND` → 404, `ROUND_EXPIRED` → 410, `VOTER_ALREADY_VOTED` → 409, `VALIDATION_ERROR` → 400...);
- **fumaça de integração:** o servidor chama `createElection` do domínio real e recebe `ok: true`.

**Pronto quando:** testes verdes; `npm test` na raiz roda domínio, shared e server.
**Commit sugerido:** `feat(server): integra o domínio real e mapeia códigos de erro para HTTP`
**Notas do agente:**
- Feito: `@voto/server` depende de `@voto/domain` e `@voto/shared` e importa o domínio direto. `statusForErrorCode` traduz qualquer `ErrorCode` em status HTTP.
- Arquivos: `apps/server/src/http/error-status.ts`, `apps/server/package.json` (dependências de workspace), `package-lock.json`.
- Como usar: `statusForErrorCode(code: ErrorCode): number` (B4 chama no error handler). `*_NOT_FOUND` (sufixo, então códigos novos do domínio já valem) e `INVALID_CODE` → 404; `VALIDATION_ERROR` → 400; `INVALID_CREDENTIALS`/`INVALID_TOKEN` → 401; `FORBIDDEN`/`VOTER_REVOKED` → 403; `ROUND_EXPIRED` → 410; `RATE_LIMITED` → 429; `INTERNAL_ERROR` → 500; o resto → 409 (inclui `VERSION_CONFLICT`).
- Testes: `test/http/error-status.test.ts` (21 execuções, `it.each` por faixa), `test/error-codes-contract.test.ts` (1: todo código do domínio está em `ERROR_CODES`; conferi que falha ao remover um código do `shared`), `test/domain-integration.test.ts` (1: `createElection` real devolve `ok: true`). Server: 24 testes, 100% de cobertura; domínio 205; shared 138.
- Decisões: (1) `VOTER_REVOKED` → 403 (e não 409), porque a §6.2 pede `403 VOTER_REVOKED` na sessão do eleitor; a tabela da §6.3 do TO-DO não o listava. (2) Os testes de contrato e de fumaça já nascem verdes (domínio e shared prontos); só o `statusForErrorCode` passou por RED real (21 falhas de asserção).

### [x] S0.5 — Esqueleto do frontend
**Ref.:** architecture §9, §14. **Atenção:** depois desta tarefa, `apps/web` passa a ser de C.
**Fazer:**
- `apps/web` (`@voto/web`) com Vite + React + TypeScript + React Router. Rota `/` com um título "Voto", vindo de `APP_NAME` do `@voto/shared`, para provar que o import entre workspaces funciona.
- Vitest com `jsdom`, `@testing-library/react`, `@testing-library/user-event` e `@testing-library/jest-dom` (arquivo de setup). Cobertura excluindo `src/main.tsx`.
- Proxy no `vite.config.ts`: `/api` e `/socket.io` (com `ws: true`) apontando para `http://localhost:3000`.
- Scripts: `dev`, `build`, `preview`, `test`, `test:coverage`, `typecheck`.

**Testes (escrever antes):** `App` renderiza o título "Voto" (busca por `getByRole('heading')`).
**Pronto quando:** `npm test`, `npm run typecheck` e `npm run build -w apps/web` passam.
**Commit sugerido:** `feat(web): cria esqueleto do frontend com React, Vite e Testing Library`
**Notas do agente:**
- Feito: `@voto/web` existe com Vite 8, React 19 e React Router 8; a rota `/` mostra o `<h1>` com `APP_NAME` de `@voto/shared`. Vitest com jsdom e Testing Library; `build`, `typecheck` e cobertura passam.
- Arquivos: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/{App.tsx,main.tsx}`, `test/{setup.ts,App.test.tsx}`, `package-lock.json`.
- Como usar: `App` só declara as `Routes`; quem monta fornece o roteador (`BrowserRouter` no `main.tsx`, `MemoryRouter` nos testes, que escolhem a rota inicial). Um único `vite.config.ts` guarda o proxy (`/api` e `/socket.io` com `ws: true` → `localhost:3000`) e o bloco `test` (jsdom, `test/setup.ts`, `coverageConfig(['src/main.tsx'])`). `test/setup.ts` importa `jest-dom/vitest` e roda `cleanup` no `afterEach`. Novas rotas entram em `App.tsx`.
- Testes: `test/App.test.tsx` (2: título na home; rota desconhecida sem o título). Web: 2 testes, 100% de cobertura. Domínio 205, shared 138, server 24. `lint`, `format:check`, `typecheck` e `build -w apps/web` verdes. Conferi que `apps/web` importando `@voto/domain` é acusado pelo ESLint (arquivo temporário já removido).
- Decisões: (1) pacote `react-router` (v8 já unifica o antigo `react-router-dom`). (2) `vite.config.ts` importa `../../vitest.shared.ts` **com extensão** e o tsconfig do web liga `allowImportingTsExtensions` (seguro, pois `noEmit`), para evitar o aviso do `configLoader: 'native'` do Vite; `server` e `shared` ainda importam sem extensão e emitem esse aviso (inofensivo). (3) `vite-env.d.ts` não foi criado: nenhum import de CSS/asset ainda. (4) Sem MSW por ora (não há chamada de rede); entra com as tarefas de C. (5) A partir daqui `apps/web` é de C.

### [x] S0.6 — CI no GitHub Actions + Codecov
**Ref.:** architecture §12.
**Fazer:**
- `.github/workflows/ci.yml`, disparado em `push` e `pull_request`, com:
  - matriz `ubuntu-latest`, `macos-latest`, `windows-latest` e `fail-fast: false`;
  - `concurrency` que cancela execuções antigas da mesma branch;
  - `actions/setup-node` com `node-version-file: .nvmrc` e `cache: npm`;
  - `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck` e `npm run test:coverage`.
- Upload no Codecov (`codecov/codecov-action`) **só no Ubuntu**, um passo por flag (`shared`, `domain`, `server`, `web`), cada um com o `lcov.info` do workspace e o token `secrets.CODECOV_TOKEN`.
- Escrever em `docs/setup-repositorio.md` os passos manuais que **o usuário** precisa fazer. O repositório `odannyraro/voto` já existe; o que precisa de permissão de **admin** é feito pelo dono ou por quem ele tornar admin:
  - entrar em codecov.io com o GitHub e ativar o repositório `voto` (hoje ele aparece como inativo);
  - copiar o token e criar o secret `CODECOV_TOKEN` em Settings → Secrets and variables → Actions;
  - opcional: em Settings → Branches, proteger a `main` exigindo o CI verde antes do merge.
- O teste de mutação (`test:mutation`) **não** entra no CI, porque é lento demais para rodar a cada commit nos 3 SOs. Ele é rodado à mão por A.

**Testes (escrever antes):** não se aplica (configuração). Valide a sintaxe do YAML, por exemplo com `npx --yes yaml-lint` ou revisão cuidadosa. Garanta que os comandos funcionam localmente.
**Pronto quando:** o workflow existe e os comandos que ele roda passam localmente. Depois que o usuário fizer o push, a execução precisa ficar verde nos 3 SOs. Se falhar, a correção vira parte desta tarefa.
**Commit sugerido:** `ci: executa lint, typecheck e testes com cobertura em Linux, macOS e Windows`
**Notas do agente:**
- Feito: `.github/workflows/ci.yml` roda em todo `push` e `pull_request`, na matriz Ubuntu/macOS/Windows (`fail-fast: false`), com `concurrency` por branch. Passos: `npm ci`, `lint`, `format:check`, `typecheck` e `test:coverage`. No Ubuntu, 4 uploads ao Codecov (flags `shared`, `domain`, `server`, `web`).
- Arquivos: `.github/workflows/ci.yml`, `docs/setup-repositorio.md` (passos manuais do usuário: ativar o repo no Codecov, criar o secret `CODECOV_TOKEN`, proteger a `main`).
- Como usar: nada a chamar. A B20 acrescenta `npm run build` depois dos testes; o e2e (§12) entra quando C criar o workspace.
- Testes: não se aplica (configuração). YAML lido com o pacote `yaml` (11 passos, 4 deles só no Ubuntu); Prettier aprova os arquivos novos; `lint`, `format:check`, `typecheck` e `test:coverage` passam na raiz (domínio 205, shared 138, server 24, web 2) e geram o `lcov.info` dos 4 workspaces.
- Decisões: (1) `fail_ci_if_error: false` nos uploads, para o CI não ficar vermelho por falha do Codecov (PR de fork não tem o secret); o custo é uma falha de upload passar despercebida, então confira o log na primeira execução. (2) Sem `codecov.yml`: a tarefa não pede e as flags são criadas pelo próprio upload; a meta de 80% do §12 fica para quando for preciso. (3) Ações em tags de major (`checkout@v4`, `setup-node@v4`, `codecov-action@v5`). (4) A execução nos 3 SOs só pode ser confirmada depois do push do usuário; se falhar, a correção volta para esta tarefa.

---

## Servidor — fundações

### [x] B1 — Portas e test doubles
**Ref.:** architecture §8.1; aulas 17 e 18 (test doubles).
**Fazer:**
- `apps/server/src/ports/`: interfaces `ElectionRepository`, `AdminRepository`, `Clock`, `Scheduler`, `CodeGenerator` (reusar o tipo do domínio) e `Notifier`.
- O repositório guarda um `ElectionRecord = History<Election>`, tipo que já existe no domínio (`{ current, past }`, criado com `createHistory(election)`). Ele guarda a eleição atual e os snapshots anteriores, para o desfazer sobreviver a reinícios. **O domínio não incrementa `election.version`** (ele nasce `0`): quem incrementa é o servidor, ao salvar (B7a). Métodos: `get(id)`, `create(record)`, `save(record, expectedVersion)`, `listByAdmin(adminId)`, `listAll()`, `findByVoterCode(code) → { electionId, voterId } | null`, `isCodeTaken(code)`.
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
**Notas do agente:**
- Feito: as 6 portas do servidor (`ElectionRepository`, `AdminRepository`, `Clock`, `Scheduler`, `CodeGenerator`, `Notifier`) e os 4 doubles de teste (`FakeClock`, `FakeScheduler`, `SpyNotifier`, `StubCodeGenerator`).
- Arquivos: `apps/server/src/ports/{election-repository,admin-repository,clock,scheduler,code-generator,notifier,index}.ts`; `apps/server/test/doubles/{fake-clock,fake-scheduler,spy-notifier,stub-code-generator}.ts` (+ um `.test.ts` ao lado de cada).
- Como usar: `import type { ElectionRepository, ElectionRecord, ... } from '../src/ports'`. Repositórios são **assíncronos** (Postgres). `Scheduler.schedule(at, key, task)` (ordem da §8.1). `FakeScheduler`: `pending()` → `{ key, at }[]`, `await fireDue(now)`, `await fire(key)` (lança se a chave não existe). `SpyNotifier`: arrays `adminStates` (`{ electionId, state }`) e `voterStates` (`{ voterId, state }`). `StubCodeGenerator(codes)` lança ao esgotar. `FakeClock(initial)`: `now()` devolve cópia, `set`, `advance(ms)`.
- Testes: 21 (`fake-clock` 5, `fake-scheduler` 11, `stub-code-generator` 2, `spy-notifier` 3). Servidor: 45 testes; os 3 testes "negativos" do scheduler (cancelar, 1 ms no futuro, `<=`) foram conferidos com mutação manual.
- Decisões: (1) `ElectionRepository.create(record)` falha se o id já existe e `save` lança `VERSION_CONFLICT` (contrato exato fica na B2). (2) `Admin = { id, username, passwordHash }` mora em `ports/admin-repository.ts`. (3) `Notifier` é síncrono (emitir no socket não espera nada) e recebe os DTOs reais de `@voto/shared`; a B7a precisará montar um `AdminElectionDTO` mesmo no "placeholder". (4) `CodeGenerator` só reexporta o tipo do domínio. (5) As portas são só tipos, então não entram nos números de cobertura.

### [x] B2 — Repositórios em memória + suíte de contrato
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
**Notas do agente:**
- Feito: `InMemoryElectionRepository` e `InMemoryAdminRepository`, mais a suíte de contrato `describeElectionRepositoryContract`, que a B17 reaproveita para o Postgres. A `HttpError` mínima nasceu aqui porque `save` precisa lançá-la.
- Arquivos: `apps/server/src/adapters/{in-memory-election-repository,in-memory-admin-repository}.ts`, `src/http/errors.ts`, `test/contracts/election-repository.contract.ts`, `test/support/election-records.ts`, `test/adapters/*.test.ts`, `apps/server/{package.json,tsconfig.json}`.
- Como usar: `new InMemoryElectionRepository()` / `new InMemoryAdminRepository()`. Contrato: `describeElectionRepositoryContract('Nome', () => new Repo())` num arquivo `.test.ts`. `anElectionRecord({ id, adminId?, voterCodes?, version? })` monta registros com o domínio real (voter id = `<eleição>:<código>`); `unwrap(result)` entrega o valor ou falha a montagem.
- Testes: contrato 21 casos (create/get, cópias, `save`, listagens, índice de códigos) + admin 7 = 28. Servidor: 73 testes, 100% de cobertura. Limite da versão (`!==`) conferido nos dois lados (esperada menor e maior que a guardada).
- Decisões: (1) `save` de eleição inexistente lança `ELECTION_NOT_FOUND` (404) e `create` de id repetido lança `Error` simples; a B17 deve seguir. (2) O índice de códigos é refeito a cada gravação, então o desfazer de um credenciamento libera os códigos. Código de eleitor revogado continua achado por `findByVoterCode` (o serviço decide o 403). (3) `HttpError(status, code, message)` já existe em `http/errors.ts`; a B4 só a usa no error handler. (4) Adicionado `@types/node` (devDependency do server, `types: ["node"]`): sem ele `structuredClone` não tem tipo, e B3/B11 precisam de `process` e `node:crypto`. Não estava explícito na §2.

### [x] B3 — Configuração por variáveis de ambiente
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
| `RATE_LIMIT` | `on` ou `off`; padrão `on` (acrescentada pelo A na A25; os e2e usam `off`) |

**Testes (escrever antes):**
- aplica os padrões;
- em produção, falha sem `JWT_SECRET`;
- `REPOSITORY=pg` sem `DATABASE_URL` falha;
- `PORT` não numérica falha com mensagem clara.

**Pronto quando:** nenhum outro módulo lê `process.env` diretamente.
**Commit sugerido:** `feat(server): valida configuração de ambiente com Zod`
**Notas do agente:**
- Feito: `loadConfig(env)` valida o ambiente com Zod e devolve `Config` tipada, com os padrões da tabela. Erros saem numa única mensagem, uma linha por variável (`- PORT: must be an integer between 1 and 65535`).
- Arquivos: `apps/server/src/config.ts`, `apps/server/test/config.test.ts`, `apps/server/package.json` (dependência `zod`, mesma versão do `shared`), `package-lock.json`.
- Como usar: `loadConfig(process.env)` só no `main.ts` (B20); o resto recebe `Config` por `AppDeps` (B4). Campos: `port`, `nodeEnv`, `jwtSecret`, `adminUsername?`, `adminPassword?`, `repository`, `databaseUrl?`, `bcryptRounds`, `voteGraceMs`, `historyLimit`, `webDistDir?`. Produção exige `JWT_SECRET`, `ADMIN_USERNAME` e `ADMIN_PASSWORD`; `REPOSITORY=pg` exige `DATABASE_URL`.
- Testes: `test/config.test.ts`, 30 execuções (padrões, leitura completa, produção, repositório, 12 valores rejeitados e 6 limites aceitos, erros agregados). Servidor: 103 testes, 100% de cobertura. Domínio 223, shared 138, web 2.
- Decisões: (1) variável **vazia** vale como ausente (`.env` e painéis de deploy deixam `VAR=` em branco). (2) Limites além da tabela: `PORT` 1–65535, `BCRYPT_ROUNDS` 4–31 (faixa do bcryptjs), `VOTE_GRACE_MS` ≥ 0, `HISTORY_LIMIT` ≥ 1. (3) Sem `z.coerce`: `Number('')` e `Number('80x')` enganam; o inteiro é validado por regex. (4) `ADMIN_USERNAME`/`ADMIN_PASSWORD` são opcionais fora de produção (sem seed). (5) O segredo JWT de dev é uma constante fixa e não exportada; os testes só exigem que seja o mesmo em dev e teste.

### [x] B4 — `buildApp`, health e tratamento de erros
**Ref.:** architecture §6.3 (mapeamento de erros), §8.1.
**Fazer:**
- `apps/server/src/app.ts`: `buildApp(deps: AppDeps)`, que devolve a instância Fastify sem chamar `listen`. `AppDeps` tem `config`, `clock`, `scheduler`, `notifier`, `codeGenerator`, `newId` e os repositórios. O domínio **não** entra nas deps: é importado direto (é puro e determinístico, então não precisa de double).
- `GET /api/health` → `{ status: 'ok' }`.
- `http/errors.ts`:
  - classe `HttpError(status, code, message)`;
  - usar `statusForErrorCode` (S0.4) para traduzir `DomainError` e `HttpError` em status;
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
**Notas do agente:**
- Feito: `buildApp(deps)` devolve o Fastify sem `listen`, com `GET /api/health` e tratamento global de erros: toda resposta de erro (inclusive rota inexistente) segue `ErrorDTO`.
- Arquivos: `apps/server/src/app.ts` (`AppDeps`, `buildApp`), `src/http/error-handler.ts` (`toErrorResponse`, `registerErrorHandling`), `src/http/validate.ts` (`parse`), `test/support/make-test-app.ts`, `package.json` (dependência `fastify` ^5), `package-lock.json`.
- Como usar: `makeTestApp(overrides?)` → `{ app, deps, clock, scheduler, notifier }`; registre rotas de teste no `app` antes do 1º `inject` e feche com `app.close()` no `afterEach`. Rotas lançam `HttpError`, `DomainError` ou deixam o `parse(schema, body)` lançar `ZodError`; o handler traduz. Novas rotas entram no `buildApp` (plugins `register`).
- Testes: `test/app.test.ts` (13 execuções: health, 404, `HttpError`, 3 códigos de domínio, Zod, JSON malformado, 415, mensagem com/sem campo, 500 sem vazar a mensagem, valor lançado que não é `Error`) e `test/http/validate.test.ts` (2). Servidor: 118 testes, cobertura 100% de linhas.
- Decisões: (1) `ZodError` e erros 4xx do próprio Fastify (JSON malformado, tipo não suportado) viram `VALIDATION_ERROR` mantendo o status (400/415). (2) Erro desconhecido → 500 `INTERNAL_ERROR` com mensagem fixa; a causa só vai para o log (`request.log.error`). (3) Logger do Fastify desligado só com `NODE_ENV=test`. (4) O tratador ficou em `http/error-handler.ts` (e não em `errors.ts`, que mantém só a `HttpError`). (5) `fastify` é dependência nova do `server`, prevista na §2. (6) Em `makeTestApp`, `StubCodeGenerator([])` é o padrão; testes de credenciamento (B11) sobrescrevem.

### [x] B5 — `AuthService`
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
**Notas do agente:**
- Feito: `AuthService` com hash de senha (bcryptjs), tokens JWT HS256 (jose) de admin (12h) e de eleitor, `verifyToken`, `login` e `seedAdmin` idempotente. A validade usa o `Clock` injetado (`currentDate` do `jwtVerify`).
- Arquivos: `apps/server/src/services/auth.ts`, `apps/server/test/services/auth.test.ts`, `apps/server/package.json` (deps `bcryptjs`, `jose`), `package-lock.json`.
- Como usar: `new AuthService({ adminRepository, clock, jwtSecret, bcryptRounds, newId })` (a B6 monta a partir de `AppDeps`/`config`). `login(u, p)` → token ou `HttpError 401 INVALID_CREDENTIALS`; `issueAdminToken(adminId)`; `issueVoterToken({ electionId, voterId })`; `verifyToken(token)` → `{ role: 'admin', adminId } | { role: 'voter', electionId, voterId }` ou `HttpError 401 INVALID_TOKEN`; `seedAdmin(u, p)` (o `main.ts` chama no boot, B20).
- Testes: `test/services/auth.test.ts`, 16 (hash 4, login 3, seed 3, expiração 2 com limite exato 12h−1s/12h, token de eleitor 1, adulterado/outro segredo/lixo 3). Servidor: 134 testes, 100% de cobertura.
- Decisões: (1) Expiração exata: em 12h o token já é rejeitado (`exp <= agora`). (2) Token de eleitor vale 7 dias (a §6 diz "enquanto a eleição durar", mas o token não conhece o fim da eleição). (3) `login` compara com um hash de isca quando o usuário não existe, para o tempo de resposta não revelar usuários. (4) `seedAdmin` com usuário já existente mantém a senha antiga. (5) Claims conferidas com Zod depois do `jwtVerify`; o `sub` guarda `adminId` ou `voterId`. (6) `bcryptjs` e `jose` são da stack (§2).

### [x] B6 — Rotas de login e autorização por papel
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
**Notas do agente:**
- Feito: `POST /api/admin/login` e `GET /api/admin/me`, mais os *preHandlers* `requireAdmin` / `requireVoter`, que preenchem `request.auth`. O `buildApp` agora cria o `AuthService` a partir das deps.
- Arquivos: `apps/server/src/http/{auth-plugin,auth-routes}.ts`, `src/app.ts`, `test/http/{auth-plugin,auth-routes}.test.ts`, `test/support/make-test-app.ts` (`TestApp.auth`).
- Como usar: `registerAuth(app, auth)` devolve `{ requireAdmin, requireVoter }` para `{ preHandler }`; `getAdminId(request)` lê o admin dentro de rota com `requireAdmin` (lança erro simples se esqueceram o hook → 500). Token ausente, não-Bearer ou inválido → 401 `INVALID_TOKEN`; token válido de outro papel → 403 `FORBIDDEN`. Nos testes, `makeTestApp()` devolve `auth` (mesmo repositório, relógio e segredo do app) para criar admins e emitir tokens.
- Testes: `auth-routes.test.ts` (7) e `auth-plugin.test.ts` (8, 4 deles `it.each` de cabeçalhos inválidos). Servidor: 149 testes, 100% de cobertura. Domínio 223, shared 138, web 2.
- Decisões: (1) `/me` com token de admin que não existe mais no repositório → 401 `INVALID_TOKEN`. (2) `request.auth` é `TokenClaims | undefined`; as rotas pegam o id por `getAdminId`, sem cast. (3) `AuthService` é construído no `buildApp` e de novo no `makeTestApp` (não entra em `AppDeps`, para a `AppDeps` da §8.1 não mudar). (4) Rate limit do login (§ riscos) não faz parte desta tarefa.

---

## Servidor — casos de uso e rotas

> Todos os testes daqui em diante usam o **domínio real**. Doubles só nas fronteiras: `FakeClock`, `FakeScheduler`, `SpyNotifier`, `StubCodeGenerator` e repositório em memória (fake).

### [x] B7a — `ElectionService`: o fluxo padrão de comandos
**Ref.:** architecture §8.2; `todo-domain.md` (A14: `closeRoundIfDue` devolve a mesma instância quando nada muda; A20: `History`).
**Fazer:**
- `test/support/election-fixtures.ts`: funções curtas que montam estados comuns **chamando os comandos públicos do domínio**, por exemplo `draftElectionWithPosition(...)` e `openElectionWithVoters(...)`. Os builders do domínio não são exportados, então isso substitui eles no servidor. Mantenha DAMP: os valores que importam ficam visíveis no teste.
- `services/election-service.ts`: método privado e genérico `execute(actor, electionId, command)`, que:
  1. carrega o registro (404 `ELECTION_NOT_FOUND`);
  2. verifica o dono (403);
  3. aplica `closeRoundIfDue(current, ctx)`;
  4. aplica o comando (uma função `(election, ctx) => Result<Election>` que chama o domínio);
  5. se o resultado for erro, lança o `DomainError` (vira HTTP na borda);
  6. incrementa `version` e empilha o snapshot com `pushSnapshot(record, next, HISTORY_LIMIT)`;
  7. salva com a versão esperada (a versão lida no passo 1);
  8. reagenda ou cancela o fechamento (chave `round:<electionId>`, no `deadline + VOTE_GRACE_MS` da rodada aberta, se houver);
  9. notifica.

  O `DomainContext` usa `clock.now()` e o `newId` das deps (`crypto.randomUUID` em produção, sequência nos testes).
- A notificação ainda é simples: `notifier.adminState(electionId, <placeholder>)`. A B7b troca pelos DTOs reais.

**Testes (escrever antes, com domínio real, `SpyNotifier`, `FakeScheduler` e repositório em memória):**
- eleição inexistente → 404;
- admin de outra eleição → 403;
- erro do domínio é propagado e **nada é salvo nem notificado**. Provoque um erro real, ex.: `addPosition` com título em branco → `INVALID_POSITION_TITLE`;
- sucesso salva com a versão incrementada e notifica o admin;
- com rodada aberta, agenda o fechamento; sem rodada aberta, cancela;
- o snapshot anterior é empilhado.

**Pronto quando:** testes verdes; o fluxo está num único lugar.
**Commit sugerido:** `feat(server): implementa fluxo padrão de comandos do ElectionService`
**Notas do agente:**
- Feito: `ElectionService` com o fluxo único `execute` (privado): carrega (404), confere o dono (403), `closeRoundIfDue`, aplica o comando, lança o `DomainError`, incrementa `version`, `pushSnapshot` com `historyLimit`, salva com a versão lida, reagenda/cancela `round:<id>` em `deadline + voteGraceMs` e notifica o admin.
- Arquivos: `apps/server/src/services/election-service.ts`, `test/services/election-service.test.ts`, `test/support/election-fixtures.ts`.
- Como usar: `new ElectionService({ electionRepository, clock, scheduler, notifier, newId, voteGraceMs, historyLimit })` (a B8 monta no `buildApp` a partir de `AppDeps`/`config`). Comandos públicos já existentes: `addPosition(adminId, electionId, input)` e `openRound(adminId, electionId, input)`, ambos devolvem o `ElectionRecord` salvo. Novo comando = método público de 1 linha: `this.execute(adminId, id, (e, ctx) => dominio(e, input, ctx))`. Fixture: `openElectionWithVoters({ id, adminId?, positionIds, voterCodes? })` → eleição `OPEN`, cargo com título = id, um candidato `<cargo>-candidate` por cargo, eleitor padrão `VOTER1`.
- Testes: `election-service.test.ts`, 13 (404, 403, erro do domínio propagado / nada salvo / ninguém notificado, versão incrementada, retorno, snapshot, limite do histórico, notificação, agendamento com horário exato, cancelamento, fechamento preguiçoso). Mutações manuais conferidas: sem `closeRoundIfDue` e ignorando `historyLimit`, um teste falha em cada. Servidor: 161 testes, 99,5% linhas / 100% branches.
- Decisões: (1) `execute` é privado, então a B7a já expõe `addPosition` (B9) e `openRound` (B12a) no serviço, só para exercitar o fluxo pela API pública; essas tarefas só criam as rotas. (2) A tarefa agendada é um *placeholder* (`() => undefined` em `rescheduleClosing`): **a B14 troca por `handleDeadline`**. É a única função sem cobertura do servidor. (3) A notificação provisória já monta um `AdminElectionDTO` válido (`election`, `next` via `nextPositionStatus`, `canUndo`, `serverNow`); a B7b troca pelo apresentador e acrescenta `currentRound`, `lastResult` e os `voterState`. (4) O snapshot empilhado é o estado lido (antes do fechamento preguiçoso). (5) Se o comando falha, o fechamento preguiçoso também não é salvo (a próxima leitura refaz). (6) Comandos do admin usam `now = clock.now()` sem tolerância; a tolerância só entra no voto (B13b) e no horário do agendamento.

### [x] B7b — Apresentadores: `AdminElectionDTO` e `VoterStateDTO`
**Ref.:** architecture §6.3, §7.
**Fazer:**
- `services/presenters.ts`: `toAdminElectionDTO(record, now)` e `toVoterStateDTO(record, voterId, now)`. O cálculo fica no domínio:
  - `voterView(election, voterId)` → base do `VoterStateDTO`;
  - `lastResultView(election)` → `lastResult`;
  - `nextPositionStatus(election)` → `next`;
  - `canUndo(record)` → `canUndo`.

  O apresentador só junta essas peças e acrescenta `serverNow`, `votedCount` e `eligibleCount`.
- O `execute` da B7a passa a notificar `adminState` com o DTO real e `voterState` para cada eleitor credenciado da eleição.

**Testes (escrever antes):**
- `serverNow` reflete o relógio;
- `canUndo` é falso sem histórico e verdadeiro com histórico;
- progresso x/y da rodada aberta;
- o DTO de eleitor **nunca** contém códigos de outros eleitores nem contagem de votos antes da liberação (monte o cenário com os fixtures: rodada fechada e ainda não liberada);
- depois de um comando, cada eleitor recebe o próprio estado.

**Pronto quando:** testes verdes.
**Commit sugerido:** `feat(server): monta DTOs de admin e eleitor e notifica após comandos`
**Notas do agente:**
- Feito: apresentadores `toAdminElectionDTO` e `toVoterStateDTO`; o `execute` do `ElectionService` agora notifica o `AdminElectionDTO` real e um `VoterStateDTO` para cada eleitor `CREDENTIALED` (revogados não recebem). O `adminState` provisório da B7a foi removido.
- Arquivos: `apps/server/src/services/presenters.ts`, `src/services/election-service.ts` (método `notifyAll`), `test/services/presenters.test.ts`.
- Como usar: `toAdminElectionDTO(record, now)` e `toVoterStateDTO(election, voterId, now)` (puros; `now` é `Date`). B8/B13a chamam o apresentador direto nas rotas de leitura (`GET /elections/:id`, `GET /voter/state`); o `voterState` do eleitor usa `voterView` do domínio, que garante sigilo (sem códigos nem contagem antes da liberação).
- Testes: `presenters.test.ts` 17 (relógio, `canUndo`, `next`, progresso x/y, cédula, sem tally parcial, `lastResult` com rodada fechada não liberada, fallback de ids, estado por eleitor, sigilo antes da liberação, `RESULTS` após liberar) e +4 em `election-service.test.ts` (DTO do admin, estado por eleitor, revogado ignorado, nada notificado em erro). Servidor: 182 testes, 99,56% statements / 100% branches / 100% linhas.
- Decisões: (1) `toVoterStateDTO` recebe a `Election` (não o registro): o voto não usa histórico. (2) `currentRound` é montado no apresentador porque o domínio só exporta a cédula do eleitor (`voterView`), não a do admin. (3) Campos opcionais (`currentRound`, `lastResult`) são omitidos, não `undefined`. (4) Notificação por eleitor usa `voter.id` (globalmente único, ver "Decisões e desvios").

### [x] B8 — Rotas de eleição
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
**Notas do agente:**
- Feito: `GET/POST /api/elections` e `GET/PATCH /api/elections/:id`, todas com `requireAdmin`. O `buildApp` agora monta o `ElectionService` a partir das deps/config.
- Arquivos: `apps/server/src/http/election-routes.ts`, `src/services/election-service.ts` (`createElection`, `listElections`, `getElection`, `updateElection`; `execute` virou `loadOwned` + `commit`), `src/services/presenters.ts` (`toElectionSummaryDTO`), `src/app.ts`, `test/http/election-routes.test.ts`, `test/services/election-service.test.ts`.
- Como usar: `service.createElection(adminId, { name, defaultVotingSeconds? })`, `listElections(adminId)` (→ `ElectionSummaryDTO[]`), `getElection(adminId, id)`, `updateElection(adminId, id, input)`; os três últimos devolvem `ElectionRecord`. Rotas novas seguem o molde de `election-routes.ts`: `parse(schema, body)`, `service.<comando>(getAdminId(request), ...)` e `toAdminElectionDTO(record, clock.now())`. Comando novo no serviço = `this.execute(adminId, id, (e, ctx) => dominio(e, input, ctx))`.
- Testes: `election-routes.test.ts` 16 (criar 3, listar 1, ler 3, editar 4, autenticação 5 com `it.each`) e +14 em `election-service.test.ts` (criar 4, listar 2, ler 5, editar 3). Servidor: 212 testes, 99,6% statements / 100% branches / 100% linhas. Domínio 223, shared 138, web 2. `lint`, `format:check` e `typecheck` verdes.
- Decisões: (1) `getElection` só grava se o prazo venceu (`closeRoundIfDue` devolve outra instância); nesse caso ganha versão nova, reagendamento e notificação (até 2026-11-25 passava por `commit` e empilhava snapshot; ver B13b). Sem prazo vencido, não grava nem notifica. (2) `createElection` não passa por `execute`: nada a carregar; salva com versão 0 e notifica o admin. (3) `POST /elections` responde 201 com o `AdminElectionDTO`; `GET /elections` devolve `ElectionSummaryDTO[]` direto (array, como na §6.1). (4) `serverNow` da resposta vem de `clock.now()` lido na rota, separado do `now` do comando (iguais no `FakeClock`).

### [x] B9 — Rotas de cargos e fila
**Ref.:** architecture §6.1 (`positions`, `queue`, `queue/suggestion`).
**Fazer:** métodos no serviço e `http/position-routes.ts`: criar, editar e remover cargo; `PUT /queue` (aplica a ordem); `GET /queue/suggestion` (só leitura, chama `suggestOrder`, não salva).
**Testes (escrever antes):**
- cada rota produz o estado esperado no DTO de resposta (ex.: criar cargo → o cargo aparece em `election.positions`; `PUT /queue` → `election.queue` na nova ordem). Verifique o **estado**, não as chamadas;
- `tiebreak` inválido → 400;
- erro do domínio (ex.: remover cargo fora de `DRAFT`) → 409;
- `suggestion` não salva nem notifica.

**Commit sugerido:** `feat(server): adiciona rotas de cargos e ordem de votação`
**Notas do agente:**
- Feito: `POST/PATCH/DELETE /api/elections/:id/positions[/:pid]`, `PUT /api/elections/:id/queue` e `GET /api/elections/:id/queue/suggestion`, todas com `requireAdmin`. A sugestão é só leitura (não salva, não agenda, não notifica).
- Arquivos: `apps/server/src/http/position-routes.ts`, `src/services/election-service.ts` (`updatePosition`, `removePosition`, `applyQueueOrder`, `suggestQueueOrder`), `src/app.ts`, `src/http/election-routes.ts` (exporta `ElectionParams`), `test/http/position-routes.test.ts`, `test/support/election-fixtures.ts` (`draftElectionWithPositions`).
- Como usar: `service.updatePosition(adminId, id, pid, input)`, `removePosition(adminId, id, pid)`, `applyQueueOrder(adminId, id, positionIds)` (os três devolvem `ElectionRecord`) e `suggestQueueOrder(adminId, id)` → `string[]`. `addPosition` já existia (B7a). Fixture: `draftElectionWithPositions({ id, adminId?, positionIds })` → rascunho só com cargos (título = id), que a B10 pode reaproveitar.
- Testes: `position-routes.test.ts`, 21 execuções (criar 3, editar 2, remover 2, fila 3, sugestão 3, autenticação 8 com `it.each`). Servidor: 233 testes, 99,66% statements / 100% branches / 100% linhas. Domínio 223, shared 138, web 2. `lint`, `format:check` e `typecheck` verdes. Os testes de sugestão usam um cenário em que a ordem sugerida difere da atual (`[treasurer, mayor]` contra `[mayor, treasurer]`), então o teste falha se a rota devolver a fila armazenada.
- Decisões: (1) `suggestQueueOrder` usa `loadOwned` direto, sem `closeRoundIfDue`: a sugestão só olha cargos pendentes e não grava. (2) Erros de domínio seguem o mapa da S0.4: `POSITION_NOT_FOUND` 404, `ELECTION_NOT_DRAFT`, `DUPLICATE_POSITION_TITLE` e `INVALID_QUEUE_ORDER` 409. (3) Nenhum schema novo: `createPositionBodySchema`, `updatePositionBodySchema` e `queueBodySchema` já existiam (S0.3b).

### [x] B10 — Rotas de candidatos
**Ref.:** architecture §6.1 (`candidates`, anexar candidato existente).
**Fazer:** criar, editar e remover candidato; `POST /positions/:pid/candidates/:cid`.
**Testes (escrever antes):**
- 201 na criação;
- `firstChoicePositionId` fora de `applications` → 400 (schema);
- erro de domínio `CANDIDATE_ALREADY_ELECTED` ao anexar → 409;
- remover candidato inexistente → 404.

**Commit sugerido:** `feat(server): adiciona rotas de candidatos`
**Notas do agente:**
- Feito: `POST /api/elections/:id/candidates` (201), `PATCH` e `DELETE .../candidates/:cid` e `POST .../positions/:pid/candidates/:cid` (anexa candidato existente), todas com `requireAdmin` e devolvendo o `AdminElectionDTO`.
- Arquivos: `apps/server/src/http/candidate-routes.ts`, `src/services/election-service.ts` (`addCandidate`, `updateCandidate`, `removeCandidate`, `attachCandidate`), `src/app.ts`, `test/http/candidate-routes.test.ts`.
- Como usar: `service.addCandidate(adminId, id, input)`, `updateCandidate(adminId, id, cid, input)`, `removeCandidate(adminId, id, cid)`, `attachCandidate(adminId, id, pid, cid)`; todos devolvem `ElectionRecord`. A B16b usa o `attachCandidate` no cenário de candidatos insuficientes.
- Testes: `candidate-routes.test.ts`, 19 execuções (criar 3, editar 3, remover 2, anexar 3, autenticação 8 com `it.each`). Servidor: 252 testes, 100% linhas / 100% branches. Domínio 223, shared 138, web 2. `lint`, `format:check`, `typecheck` e `test:coverage` verdes.
- Decisões: (1) o cenário de candidato eleito (`CANDIDATE_ALREADY_ELECTED`) é montado no próprio teste com `openRound` + `castVote` do domínio real (um eleitor só: o voto fecha a rodada e decide o cargo). (2) Nenhum schema novo: `createCandidateBodySchema` e `updateCandidateBodySchema` já existiam (S0.3b). (3) Erros de domínio seguem o mapa da S0.4: `CANDIDATE_NOT_FOUND`/`POSITION_NOT_FOUND` 404; `CANDIDATE_ALREADY_ELECTED` 409.

### [x] B11 — Credenciamento de eleitores e gerador de códigos
**Ref.:** architecture §5.5 (formato do código), §6.1 (`voters`).
**Fazer:**
- `adapters/crypto-code-generator.ts`: `createCodeGenerator((max) => crypto.randomInt(max))`, usando o gerador puro do domínio (A7) com `crypto` como fonte de aleatoriedade. Chamada do domínio: `credentialVoters(election, { count, labels? }, codeGenerator, ctx)` → `Result<{ election, codes }>`.
- **Unicidade global:** o eleitor entra só com o código, então o código não pode existir em nenhuma eleição. O serviço gera N códigos, confere cada um com `repo.isCodeTaken` (e contra os já gerados na mesma leva) e passa ao domínio um gerador que devolve exatamente esses códigos.
- Rotas `POST /voters` (devolve `codes` + DTO) e `DELETE /voters/:vid` (revoga).

**Testes (escrever antes):**
- gerador: tamanho 8, só caracteres do alfabeto (verificar a propriedade, sem depender de sorte);
- colisão: com o `StubCodeGenerator` devolvendo um código já usado, o serviço descarta e usa o próximo;
- `count` 0 ou 501 → 400;
- revogar → o eleitor fica `REVOKED` no DTO.

**Commit sugerido:** `feat(server): credencia eleitores com códigos únicos e aleatórios`
**Notas do agente:**
- Feito: `POST /api/elections/:id/voters` (201 `{ codes, election }`) e `DELETE .../voters/:vid` (devolve o `AdminElectionDTO`), ambas com `requireAdmin`. Os códigos vêm de `createCryptoCodeGenerator()` e são únicos em todas as eleições.
- Arquivos: `apps/server/src/adapters/crypto-code-generator.ts`, `src/http/voter-routes.ts`, `src/services/election-service.ts` (`credentialVoters`, `revokeVoter`, `generateUniqueCodes`, `fixedCodes`), `src/app.ts` (`codeGenerator` entra no `ElectionService`), `test/adapters/crypto-code-generator.test.ts`, `test/http/voter-routes.test.ts`.
- Como usar: `service.credentialVoters(adminId, id, { count, labels? })` → `{ record, codes }`; `service.revokeVoter(adminId, id, voterId)` → `ElectionRecord`. `ElectionServiceDeps` ganhou `codeGenerator`; no teste, `makeService({ codes })` e `makeTestApp({ codeGenerator: new StubCodeGenerator([...]) })`. Na B18, `compose.ts` passa `createCryptoCodeGenerator()` em `AppDeps.codeGenerator`.
- Testes: gerador 2 (200 amostras no formato; sem repetição), serviço 9 (códigos e rótulos, colisão com outra eleição, repetição na mesma leva, notificações, 403, rótulos demais sem salvar, revogar, `VOTER_NOT_FOUND`), rotas 8 (201, lote de 500, `count` 0 e 501 → 400, 401 nas duas rotas, `REVOKED`, 404). Servidor: 271 testes, 100% linhas / 99,09% branches.
- Decisões: (1) o serviço gera os N códigos **antes** de chamar o domínio (a conferência no repositório é assíncrona e o domínio é síncrono) e entrega a ele um gerador fixo (`fixedCodes`). (2) Código repetido ou já usado é descartado e sorteado de novo, sem limite de tentativas (31^8 combinações). (3) Duas credenciais simultâneas em eleições diferentes podem gerar o mesmo código entre a conferência e o `save`; no Pg a chave primária de `voter_codes` (B17) barra, e a rota responde 500. Aceito pelo risco ínfimo. (4) Revogar um eleitor já revogado devolve 403 `VOTER_REVOKED` (mapa da S0.4). (5) Sem schema novo: `credentialVotersBodySchema` já existia.

### [x] B12a — Rotas do ciclo de votação (parte 1)
**Ref.:** architecture §5.3, §6.1.
**Fazer:**
- Funções do domínio: `openElection(e)`, `nextPositionStatus(e)`, `openRound(e, { positionId, durationSeconds? }, ctx)`, `closeRound(e, roundId)`. Note que `openRound` também falha com `RUNOFF_PENDING` e `NO_CREDENTIALED_VOTERS` (`todo-domain.md`, A12).
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
**Notas do agente:**
- Feito: `POST /api/elections/:id/open`, `GET .../next`, `POST .../rounds` (201) e `POST .../rounds/:rid/close`, todas com `requireAdmin`. Abrir e fechar rodada já agendam/cancelam `round:<id>` pelo fluxo da B7a.
- Arquivos: `apps/server/src/http/round-routes.ts` (`registerRoundRoutes`), `src/services/election-service.ts` (`openElection`, `nextPosition`, `closeRound`), `src/app.ts`, `test/http/round-routes.test.ts`.
- Como usar: `service.openElection(adminId, id)` e `service.closeRound(adminId, id, roundId)` → `ElectionRecord`; `service.nextPosition(adminId, id)` → `NextPositionDTO` (só leitura). A B12b acrescenta as demais rotas do ciclo, seguindo o molde de `round-routes.ts` (pode ser outro arquivo de rotas). `openRound` do serviço já existia (B7a).
- Testes: `round-routes.test.ts`, 26 execuções (abrir 3, `next` 3, abrir rodada 8, fechar 4, autenticação 8 com `it.each`: 401 e 403 nas 4 rotas). Servidor: 305 testes, 100% linhas / 99,09% branches. Domínio 223, shared 138, web 2. `lint`, `format:check`, `typecheck` e `test:coverage` verdes. Mutações manuais conferidas: `nextPosition` gravando (via `getElection`) e agendamento sem `voteGraceMs` derrubam um teste cada.
- Decisões: (1) `nextPosition` aplica `closeRoundIfDue` **em memória** antes de calcular o próximo passo, para um prazo vencido que o timer ainda não fechou não aparecer como `ROUND_IN_PROGRESS`; nada é gravado. (2) `POST /open` e `/close` respondem 200; `POST /rounds` responde 201 (§6.1). (3) Sem schema novo: `openRoundBodySchema` já existia. (4) Erros de domínio seguem o mapa da S0.4: `ROUND_NOT_FOUND`/`POSITION_NOT_FOUND` 404; `ELECTION_NOT_DRAFT`, `NO_POSITIONS`, `ROUND_IN_PROGRESS`, `NO_CREDENTIALED_VOTERS` e `ROUND_NOT_OPEN` 409.

### [x] B12b — Rotas do ciclo de votação (parte 2)
**Ref.:** architecture §5.4 (candidatos insuficientes, resiliência), §6.1.
**Fazer:**
- `POST /positions/:pid/runoff`;
- `POST /rounds/:rid/release`;
- `POST /positions/:pid/defer`;
- `POST /positions/:pid/cancel` (corpo `{ confirmTitle }`);
- `POST /rounds/:rid/annul`;
- `POST /undo`;
- `POST /finish`.

Funções do domínio: `openRunoff(e, { positionId, durationSeconds? }, ctx)`, `releaseResults(e, roundId)`, `deferPosition(e, positionId)`, `cancelPosition(e, positionId, confirmTitle)`, `annulRound(e, roundId)`, `finishElection(e)` e `undo(record)`. Confira as assinaturas exatas no `index.ts` do domínio.

`undo` é especial: em vez de um comando do domínio sobre a eleição, aplica `undo` sobre o histórico do registro. Sem histórico → 409 `NOTHING_TO_UNDO`. O `undo` **não** empilha um novo snapshot. **Atenção à versão:** o estado restaurado tem uma `version` antiga. Antes de salvar, troque-a por `versão atual + 1` (e salve com a versão atual como esperada); senão a versão "volta no tempo" e um cliente com dados velhos poderia sobrescrever o estado sem `VERSION_CONFLICT`. Teste: depois de um `undo`, a versão salva é maior que a anterior.

**Testes (escrever antes):**
- `cancel` sem `confirmTitle` → 400;
- `undo` restaura a versão anterior e notifica;
- `undo` sem histórico → 409;
- depois de `undo` que reabre uma rodada, o fechamento é reagendado;
- `release` notifica os eleitores.

**Commit sugerido:** `feat(server): adiciona rotas de segundo turno, liberação, adiamento, cancelamento e desfazer`
**Notas do agente:**
- Feito: `POST .../positions/:pid/runoff` (201), `.../rounds/:rid/release`, `.../positions/:pid/defer`, `.../positions/:pid/cancel`, `.../rounds/:rid/annul`, `.../undo` e `.../finish`, todas com `requireAdmin` e devolvendo o `AdminElectionDTO`.
- Arquivos: `apps/server/src/http/resolution-routes.ts` (`registerResolutionRoutes`), `src/services/election-service.ts` (`openRunoff`, `releaseResults`, `deferPosition`, `cancelPosition`, `annulRound`, `finishElection`, `undo`; novo `persist`), `src/app.ts`, `test/http/resolution-routes.test.ts`.
- Como usar: `service.<comando>(adminId, id, ...)` devolve `ElectionRecord`, como os demais. `persist(next, expectedVersion, ctx)` (privado) salva, reagenda e notifica; `commit` e `undo` o usam. A B13b pode reaproveitar `commit`/`persist` para o voto.
- Testes: `resolution-routes.test.ts`, 41 execuções (runoff 5, release 4, defer 3, cancel 4, annul 3, finish 2, undo 6, autenticação 14 com `it.each`). Servidor: 346 testes, 100% linhas / 99,13% branches. Domínio 223, shared 138, web 2. `lint`, `format:check`, `typecheck` e `test:coverage` verdes.
- Decisões: (1) `undo` não passa por `commit`: não empilha snapshot nem aplica `closeRoundIfDue`; grava o estado restaurado com `version = atual + 1` e `expectedVersion = atual` (teste: versão salva 2, depois de 0 → 1 → undo). Rodada reaberta pelo undo é reagendada pelo `persist`. (2) `POST .../runoff` aceita corpo ausente (`request.body ?? {}`), pois `durationSeconds` é opcional; `cancel` exige `confirmTitle` (400 sem ele). (3) Erros de domínio seguem o mapa da S0.4: `*_NOT_FOUND` 404; `POSITION_NOT_AWAITING_RUNOFF`, `ROUND_NOT_CLOSED`, `POSITION_NOT_PENDING`, `CONFIRMATION_MISMATCH`, `ROUND_IN_PROGRESS` e `NOTHING_TO_UNDO` 409. (4) O cenário de 2º turno é montado no próprio teste com o domínio real (3 candidatos, 5 eleitores, votos 2/2/1).

### [x] B13a — Sessão e estado do eleitor
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
**Notas do agente:**
- Feito: `POST /api/voter/session` (pública, `{ token, electionId, electionName }`) e `GET /api/voter/state` (`requireVoter`). `VoterService` com `startSession` e `getState`; o estado aplica o prazo vencido (salva, reagenda e notifica) antes de montar o `VoterStateDTO`.
- Arquivos: `apps/server/src/services/voter-service.ts`, `src/http/voter-access-routes.ts`, `src/http/auth-plugin.ts` (`getVoterIds`), `src/services/election-service.ts` (`settleDueRound`, `settle`), `src/app.ts`, `test/http/voter-access-routes.test.ts`.
- Como usar: `voters.startSession(code)` / `voters.getState(voterId, electionId)` (os ids vêm do token via `getVoterIds(request)`). `ElectionService.settleDueRound(electionId)` → registro com o prazo aplicado ou `null`, sem conferir dono: a B13b e a B14 podem reaproveitá-lo; `getElection` agora usa o mesmo `settle` privado. A B13b acrescenta `castVote` ao `VoterService` (mesmas deps) e a rota em `voter-access-routes.ts`.
- Testes: `voter-access-routes.test.ts`, 18 execuções (sessão 8: válido, minúsculas, inexistente, revogado, índice inconsistente, 3 formatos inválidos com `it.each`; estado 10: sem token, token de admin, eleição e eleitor sumidos, `WAITING`, `VOTING`, revogado, prazo vencido fechado e salvo, admin notificado, nada gravado sem prazo vencido). Servidor: 364 testes, ~99,8% linhas. Domínio 223, shared 138, web 2. `lint`, `format:check`, `typecheck` e `test:coverage` verdes.
- Decisões: (1) revogado com token ainda válido → 403 `VOTER_REVOKED` também em `/voter/state`. (2) Token cuja eleição ou eleitor não existe mais → 401 `INVALID_TOKEN` (mesma lógica do `/admin/me`). (3) Índice de códigos apontando para eleição/eleitor inexistente → 404 `INVALID_CODE` (coberto com um repositório de teste que estende o em memória). (4) Arquivo e função se chamam `voter-access-routes` / `registerVoterAccessRoutes` para não colidir com `voter-routes.ts` (credenciamento do admin). (5) O exemplo `npx vitest run arquivo -w apps/server` do CLAUDE.md não funciona (`-w` é `--watch` no Vitest): rode de dentro do workspace (`cd apps/server && npx vitest run test/...`).

### [x] B13b — Registro de votos
**Ref.:** architecture §5.4 (votação), §6.2, §8.3.
**Fazer:**
- `VoterService.castVote(voterId, electionId, roundId, choice)`: usa o mesmo fluxo da B7a, mas a autorização é do eleitor, não do dono. Chamada do domínio: `castVote(e, { roundId, voterId, choice }, ctx)`.
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
**Notas do agente:**
- Feito: `POST /api/voter/votes` (`requireVoter`, corpo `{ roundId, choice }`, 204). O voto passa pelo mesmo salvar/reagendar/notificar dos comandos do admin: o admin recebe o progresso x/y, cada eleitor recebe o próprio estado (`VOTED` para quem votou) e, se foi o último apto, o agendamento é cancelado.
- Arquivos: `apps/server/src/services/election-service.ts` (`castVote`; o fim do `commit` virou o privado `save`), `src/services/voter-service.ts` (`castVote`), `src/http/voter-access-routes.ts`, `test/http/voter-votes.test.ts`.
- Como usar: `voters.castVote(voterId, electionId, { roundId, choice })` → `void`; `elections.castVote(...)` → `ElectionRecord | null` (`null` = eleição sumiu; o `VoterService` converte em 401 `INVALID_TOKEN`).
- Testes: `voter-votes.test.ts`, 21 execuções (aceito, em branco, progresso do admin, estado de quem votou e dos demais, repetido 409, limite exato `deadline + 1s` aceito e `+1 ms` → 410, nada salvo no 410, agendamento cancelado/mantido, `INVALID_CHOICE`, `ROUND_NOT_FOUND`, eleitor de outra eleição, revogado 403, token órfão 401, `choice` ausente/em branco 400, sem token, token de admin, estado `VOTED`). Servidor: 385 testes, 99,37% statements / 98,51% branches. Mutações manuais conferidas: sem tolerância, tolerância dobrada e `closeRoundIfDue` antes do voto derrubam um ou dois testes cada.
- Decisões: (1) o voto **não** aplica `closeRoundIfDue` antes: com ele, voto atrasado acharia a rodada fechada e daria 409 `ROUND_NOT_OPEN` em vez de 410. O domínio compara o prazo com `now - voteGraceMs`. Se o timer já fechou a rodada (depois de `deadline + grace`), o voto atrasado recebe 409 `ROUND_NOT_OPEN`. (2) Eleitor de outra eleição: o token fixa a eleição, então a rodada alheia não existe para ele e a resposta é **404 `ROUND_NOT_FOUND`** (não 403, como o TO-DO dizia); não vaza rodadas de outras eleições e nada muda na eleição alheia. `VOTER_NOT_ELIGIBLE` (credenciado depois da abertura) segue 409 pelo mapa da S0.4. (3) ~~**Pendência para decidir:**~~ **resolvida em 2026-11-25** (o voto não empilha mais snapshot; ver a correção abaixo). Texto original: seguindo o fluxo da B7a, cada voto empilha um snapshot. Com `HISTORY_LIMIT` = 50 e mais de 50 eleitores, os votos empurram para fora os snapshots do admin (o desfazer não alcança mais o estado anterior à rodada), e um `undo` logo após um voto desfaz só aquele voto. Se isso incomodar, a correção é não empilhar snapshot no voto (uma linha em `castVote`/`save`); não mudei por divergir do §8.2.
- Correção (2026-11-25, pós-B17): `castVote` repete em `VERSION_CONFLICT` até `MAX_VOTE_ATTEMPTS` = 50 vezes (`retryOnVersionConflict`), relendo a eleição e reaplicando o voto pelo domínio (`applyVote`); o prazo é julgado pelo instante de chegada. Comandos do admin não repetem. Testes: 7 em `election-service.test.ts` (4 falharam antes da correção); 6 mutações manuais, todas pegas. Servidor: 498 testes, 99,84% statements / 99,44% branches / 100% linhas.
- Correção (2026-11-25): o voto **não empilha snapshot de desfazer**: `applyVote` grava `{ current, past }` com versão + 1; só `commit` chama `pushSnapshot` (o privado `save` deu lugar a `nextElection`). O `undo` depois de votos volta ao estado anterior ao último passo do admin e descarta os votos posteriores, inclusive o voto que fechou a rodada. Testes: 4 em `election-service.test.ts` (3 falharam antes); 5 mutações manuais, todas pegas. Servidor: 502 testes, 100% linhas.
- ~~Pendência: o fechamento **pelo timer** empilha um snapshot com a rodada vencida aberta, e o `undo` fica preso nela~~ **corrigida** em 2026-11-25 (ver abaixo).
- Pendências vistas na correção (confirmadas com teste temporário): ~~uma leitura (`/voter/state` ou painel) entre `deadline` e `deadline + grace` fecha a rodada sem tolerância, e o voto que ainda estava no prazo estendido recebe 409 `ROUND_NOT_OPEN`~~ **corrigida** (ver abaixo); ~~leituras simultâneas de uma rodada vencida disputam a versão e uma recebe 409~~ **corrigida** (ver abaixo).
- Correção (2026-11-25): o fechamento preguiçoso respeita a tolerância: leituras do eleitor e do admin, `GET /next` e comandos do admin só fecham a rodada depois de `deadline + voteGraceMs` (`closeOverdueRound`). O timer (`handleDeadline`) julga sem desconto, pois já dispara nesse horário. O voto atrasado segue 410, mesmo após uma leitura na tolerância. Testes: 8 novos (7 falharam antes); em 8 testes antigos (5 pontos de arranjo) o instante “vencido” passou de `deadline + 1 s` para 1 ms depois, sem mudar asserções; 8 mutações manuais, todas pegas. Servidor: 510 testes.
- Correção (2026-11-25): o fechamento automático (timer e leitura de rodada vencida) **não empilha snapshot**: `settle` grava `{ current, past }` com versão + 1, sem passar por `commit`. O `undo` depois dele volta ao estado anterior à abertura da rodada. Testes: 3 (timer, leitura do admin, leitura do eleitor), todos falharam antes; 4 mutações manuais, todas pegas. Servidor: 513 testes. O que sobrou está na B17b.
- Correção (2026-11-25): o fechamento por prazo que perde a disputa pela gravação (leitura do eleitor ou do admin e `handleDeadline`) relê e devolve o estado atual, com `retryOnVersionConflict` até `MAX_SETTLE_ATTEMPTS` (= 50); comandos do admin seguem com 409 imediato. Testes: 5 no serviço/HTTP (4 falharam antes; o de desistir após o limite já passava) e 3 do double `GatedReadsElectionRepository`, que segura leituras para forçar a disputa (com `app.inject` puro o teste passava sem a correção); 8 mutações manuais, todas pegas. Servidor: 521 testes.
- Medição (2026-11-25, depois de o voto deixar de empilhar snapshot): Postgres 16 local, pool padrão (10), 3 execuções por cenário; “histórico” = passos do admin guardados, cada um com todos os eleitores. 50 votos simultâneos, todos aceitos: ~0,5 s (histórico 0), ~1,1 s (10), ~3,3 s (50). 100 votos: 22–27 recebem 409 em todos os cenários, em ~1,6 s (0), ~4,5 s (10), ~18 s (50). Código anterior (voto com snapshot, histórico 0), nas mesmas condições: 50 em ~1,8 s; 100 em ~13 s com 23 409; o registro crescia de 8 para 467 KB. No Neon, com latência de rede, não foi medido. O limite foi **resolvido** pela fila de gravações (B17b, item 3).

### [x] B14 — Fechamento automático no prazo
**Ref.:** architecture §8.3.
**Fazer:**
- `adapters/timeout-scheduler.ts`: implementa `Scheduler` com `setTimeout`. Limita o atraso a 2³¹−1 ms, aceita atraso negativo (dispara logo), reagendar a mesma chave substitui a tarefa anterior e expõe `cancelAll()` para o desligamento.
- `ElectionService.handleDeadline(electionId)` é o callback agendado: carrega, aplica `closeRoundIfDue`, e salva e notifica só se algo mudou. Erros são registrados em log, sem derrubar o processo.

**Testes (escrever antes):**
- `TimeoutScheduler` com `vi.useFakeTimers()`: dispara no tempo certo, `cancel` impede, reagendar substitui;
- `handleDeadline` com `FakeClock` + domínio real: fecha e notifica quando o prazo venceu; não salva quando nada mudou (`closeRoundIfDue` devolve a mesma instância, compare com `===`).

**Commit sugerido:** `feat(server): fecha rodadas automaticamente ao fim do prazo`
**Notas do agente:**
- Feito: `TimeoutScheduler` (porta `Scheduler` com `setTimeout`) e `ElectionService.handleDeadline`, que o agendamento de `round:<id>` agora chama no lugar do placeholder. Abrir a rodada já agenda o fechamento real; o fechamento por timer salva, reagenda (cancela) e notifica como qualquer comando.
- Arquivos: `apps/server/src/adapters/timeout-scheduler.ts`, `src/ports/logger.ts` (porta `Logger`, nova), `src/services/election-service.ts` (`handleDeadline`, dep `logger`), `src/app.ts` (passa `app.log` como `logger`), `test/adapters/timeout-scheduler.test.ts`, `test/doubles/spy-logger.ts` (+ teste), `test/services/election-service.test.ts`.
- Como usar: `new TimeoutScheduler()` em `AppDeps.scheduler` na B18, com `cancelAll()` no encerramento (`SIGTERM`/`SIGINT`). `ElectionServiceDeps.logger` é obrigatório (`Logger.error(context, message)`; o logger do Fastify serve). Ao reagendar as rodadas abertas depois de um reinício, a B18 deve usar `schedule` em `deadline + voteGraceMs` (horário passado dispara logo) e não chamar `handleDeadline` direto: ele julga o prazo sem tolerância e, antes da hora, fecharia a rodada cedo.
- Testes: `timeout-scheduler.test.ts` 15 (disparo no instante e 1 ms antes, passado dispara logo, uma vez só, substituir chave, chaves independentes, reagendar a própria chave, atraso > 2³¹−1 ms em etapas, cancelar inclusive em etapas, `cancelAll`), `handleDeadline` 9 em `election-service.test.ts` (fecha, notifica admin e eleitores, cancela o agendamento, nada salvo/notificado sem prazo vencido, eleição inexistente, tarefa agendada pela abertura fecha a rodada, falha vai ao log sem rejeitar), `spy-logger.test.ts` 2. Servidor: 411 testes, 99,6% statements / 98,5% branches / 100% linhas.
- Decisões: (1) `handleDeadline` e as leituras passam pelo mesmo `settle` privado, então não há lógica de fechamento duplicada. (2) Falha vira `logger.error({ electionId, err })`; a rodada não fecha pelo timer, mas fecha na próxima leitura/escrita (§8.3). Um `VERSION_CONFLICT` é relido e tentado de novo (desde 2026-11-25; ver B13b), então só vai ao log se a disputa persistir. (3) Nova porta `Logger` (a B14 pedia log, e o serviço não conhecia logger); o Fastify a satisfaz. (4) `TimeoutScheduler` lê `Date.now()` (é a fronteira com o tempo real; as regras usam `Clock`) e cumpre prazos acima de 2³¹−1 ms rearmando em etapas. A tarefa agendada não pode lançar (documentado na classe). (5) Mutações manuais: sem `cancel` ao reagendar e sem rearmar são detectadas; remover o `timers.delete` no disparo (vazamento de memória) e o `Math.min` (laço de timers de 1 ms) sobrevivem porque não mudam o comportamento observável.

### [x] B15 — Tempo real com Socket.IO
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
**Notas do agente:**
- Feito: gateway Socket.IO no mesmo servidor HTTP do Fastify: handshake com JWT (`connect_error` `INVALID_TOKEN`), eleitor entra em `voters:<eid>` e `voter:<vid>`, admin entra em `admin:<eid>` via `admin:watch` (com checagem de dono por `getElection`) e recebe `admin:state` na hora. `SocketNotifier` emite para as salas.
- Arquivos: `apps/server/src/realtime/{gateway,rooms}.ts`, `src/adapters/socket-notifier.ts`, `src/app.ts` (`AppDeps.realtime?`), `test/realtime/gateway.test.ts`, `test/support/realtime-test-app.ts`, `package.json` (`socket.io`; `socket.io-client` em dev).
- Como usar (B18): `const io = createRealtimeServer(); buildApp({ ...deps, notifier: new SocketNotifier(io), realtime: io })`. O `buildApp` liga o `io` ao `app.server` e o fecha no `preClose`. Testes: `startRealtimeApp()` (porta efêmera, clientes fechados no fim do teste), `connected`, `waitForEvent`, `waitForConnectError`, `collectEvents`.
- Testes: `gateway.test.ts`, 9 (sem token, token inválido, dono recebe estado, eleição alheia, pedido malformado, `voterState` só ao eleitor certo e ao destinatário, voto via HTTP gera `admin:state` com 1/2 e `VOTED` ao eleitor). Servidor: 420 testes, 99,79% linhas; arquivos novos com 100%. Estável em 10 execuções seguidas. Mutações manuais (sem checagem de dono; `voterState` para todos) derrubam um teste cada.
- Decisões: (1) **Assinatura diferente do TO-DO:** `attachRealtime(io, httpServer, deps)` recebe o `io` em vez de criá-lo, porque há um ciclo (notificador → `io` → servidor HTTP → app → serviços → notificador); o `io` nasce antes (`createRealtimeServer`) e o `buildApp` o liga quando `AppDeps.realtime` vem (campo opcional novo; testes só com `inject` não mudam). (2) Testes de "não recebeu" usam um evento sentinela na mesma conexão (a ordem é garantida), sem `sleep`. (3) `admin:watch` inválido, alheio ou inexistente só não entra na sala (sem resposta: o contrato do `shared` não tem *ack* nem evento de erro); o cliente se ressincroniza por HTTP. (4) A sala `voters:<eid>` é criada conforme a §7, mas nenhum evento a usa ainda. (5) Sem `cors` no Socket.IO: front e API ficam na mesma origem (proxy do Vite em dev).

---

## Integração, persistência e produção

### [x] B16a — Cenário de integração HTTP completo (fluxo básico)
**Depende de:** nada pendente (o domínio de A já está pronto; o marco M1 foi atingido antes do Sprint 0). Referência útil: `packages/domain/test/scenarios/full-election.test.ts` (A22) mostra a sequência de comandos.
**Fazer:**
- `test/integration/election-flow.test.ts`, um cenário só por HTTP:
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

**Commit sugerido:** `test(server): cobre cenário completo de votação via HTTP`
**Notas do agente:**
- Feito: cenário de ponta a ponta só por HTTP (`app.inject`): login da Ana, eleição com o cargo Mayor e 2 candidatos, 3 códigos, abertura, 3 sessões, rodada, 3 votos (fecha sozinha), resultado visível ao admin e oculto ao eleitor (`WAITING`), `release` e eleitor em `RESULTS`.
- Arquivos: `apps/server/test/integration/election-flow.test.ts` (nenhum código de produção alterado).
- Como usar: cada passo é uma função auxiliar nomeada (`logIn`, `createMayorRace`, `credentialThreeVotersAndOpen`, `startVoterSession`, `openRound`, `castVote`, `voterState`, `adminCall`); a B16b pode copiá-las para um helper compartilhado se precisar dos mesmos passos.
- Testes: 1 (cenário único, de propósito, como a tarefa pede). Servidor: 421 testes, 99,62% statements / 98,62% branches / 99,79% linhas. Domínio 223, shared 138, web 2. `lint`, `format:check`, `typecheck` e `test:coverage` verdes.
- Decisões: (1) nenhuma divergência entre servidor e domínio apareceu: o teste já nasceu verde, então a prova de que ele testa algo foi uma mutação manual (`releaseResults` virando no-op no serviço) que o derrubou com `WAITING` no lugar de `RESULTS`; revertida. (2) Os códigos de eleitor vêm de um `StubCodeGenerator`, e o admin é semeado com `auth.seedAdmin` antes do login real por HTTP. (3) Os ids de candidatos vêm do DTO devolvido ao cadastrá-los, sem depender do formato de `newId`.

### [x] B17 — Repositórios PostgreSQL
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
**Notas do agente:**
- Feito: `migrate(pool)` idempotente (3 tabelas), `PgElectionRepository` (registro com histórico em JSONB; `create`/`save` e códigos na mesma transação; `UPDATE ... AND version`) e `PgAdminRepository`.
- Arquivos: `apps/server/src/adapters/pg/{sql,transaction,migrate,pg-election-repository,pg-admin-repository}.ts`, `src/adapters/repository-errors.ts` (erros comuns à memória e ao Pg), `test/adapters/pg/*`, `test/contracts/admin-repository.contract.ts`, `test/doubles/{pg-mem-pool,spy-sql-pool}.ts`; deps `pg`, `pg-mem` e `@types/pg` (só tipos).
- Como usar (B18): `const pool = new Pool({ connectionString: config.databaseUrl })` (o `Pool` do `pg` cabe na porta `SqlPool`); `await migrate(pool)`; `new PgElectionRepository(pool)` / `new PgAdminRepository(pool)`. Registrar `pool.on('error', ...)` (sem ouvinte, a queda de uma conexão ociosa, comum no Neon, derruba o processo) e `pool.end()` no encerramento. Testes e B16b: `await createMigratedPgMemPool()`.
- Testes: 58 novos (contrato de eleições no Pg 24 + 6 só do Pg, contrato de admins no Pg 7 + 1, `migrate` 4, transação 6, doubles 7, 3 casos novos de contrato rodando também na memória). Servidor: 491 testes, 99,83% statements / 99,43% branches / 100% linhas. Domínio 223, shared 138, web 2. 11 mutações manuais, todas pegas.
- Decisões: (1) o `pg-mem` ignora `ROLLBACK`: o double o emula com `db.backup()` e recusa comandos no pool com transação aberta (senão "gravar fora da transação" passava). (2) Outras limitações dele: `noAstCoverageCheck` para repetir `CREATE TABLE IF NOT EXISTS`; `ON CONFLICT DO NOTHING` sem alvo (com alvo ele conta as linhas errado). (3) Conferência única, fora do repositório: os 2 contratos, rollback, 4 `save` simultâneos (só 1 vence) e 500 eleitores passaram num Postgres 16 real (contêiner temporário, 34 testes).
- **Pendências:** (a) ~~votos simultâneos recebem 409 `VERSION_CONFLICT`~~ **corrigida** em 2026-11-25 (nova tentativa no `castVote`, ver B13b). Limite medido num Postgres 16 local: rajadas de até 50 votos são todas aceitas (50 levaram ~3 s); com 100, 24 ainda recebem 409 e a rajada leva ~25 s, porque o custo cresce com o quadrado. O limite acima de 50 foi **resolvido** em 2026-11-25 pela fila de gravações por eleição (B17b, item 3). (b) ~~`listAll`/`listByAdmin` no Pg não garantem ordem~~ **corrigida** em 2026-11-25 (ver abaixo). (c) ~~cada voto regrava o registro inteiro com até 50 snapshots~~ **atenuada** em 2026-11-25: o voto não empilha mais snapshot, então o histórico só cresce com passos do admin (ver B13b); o registro continua sendo regravado inteiro.
- Correção (2026-11-25): `listByAdmin` e `listAll` devolvem as eleições na **ordem de criação**, mesmo após regravação (contrato). No Pg, coluna `creation_order SERIAL` + `ORDER BY`. Testes: 4 casos de contrato nas duas implementações (8 execuções; as 2 de regravação no Pg falharam antes); 7 mutações manuais, todas pegas; 38 testes temporários passaram num Postgres 16 real. O `migrate` não acrescenta a coluna a uma tabela criada pelo esquema anterior (não há banco implantado). Servidor: 529 testes.
- Refatoração de testes (2026-11-25): os 5 `await Promise.allSettled([x])` do contrato de eleições (2) e de `pg-election-repository.test.ts` (3) viraram `await expect(x).rejects...` com o motivo esperado. Sob mutação em que a rejeição acontece por outro motivo, os testes antigos passavam e os 5 novos falham. Mesma contagem (servidor 529). Os 2 de `transaction.test.ts` receberam a mesma troca (`.rejects.toBe(WORK_FAILURE)`), sem mudar as asserções de `pool.events`.

### [x] B17b — Correções pós-revisão
**Fazer** (itens achados na revisão da B17, aprovados pelo usuário em 2026-11-25; cada um com teste primeiro e commit próprio, o 3 antes do 1):
- **Item 3 — fila de gravações por eleição** (✔ feito em 2026-11-25, ver as notas): `MAX_VOTE_ATTEMPTS` = 50 só garante rajadas de até 50 votos; com 100, 22–27 recebem 409, e o custo cresce com o quadrado da rajada e com o tamanho do registro (medição na B13b). Todas as gravações de uma eleição (votos, fechamento por prazo e comandos do admin) passam por uma fila em memória por eleição, uma de cada vez, sem dependência nova. O `retryOnVersionConflict` fica como rede de segurança. A fila de uma eleição é liberada quando esvazia, e uma gravação que falha não trava as seguintes. Registrar em "Decisões e desvios" que vale para uma instância só do servidor. No fim, repetir a medição de 100 votos no Postgres local.
  - Teste: 100 votos simultâneos (`Promise.all`, repositório em memória) são todos aceitos e contados.
  - Commit sugerido: `fix(server): enfileira as gravações de uma mesma eleição`
- **Item 1 — prazo vencido fechado dentro de um comando do admin** (✔ feito em 2026-11-25): se o timer se perdeu e um comando fecha a rodada vencida, o snapshot do comando guarda a rodada ainda aberta, e o `undo` a devolve aberta por um instante (confirmado com teste temporário). Em `commit`, empilhar o estado já fechado.
  - Teste: o `undo` desse comando devolve a rodada fechada, sem o efeito do comando.
  - Commit sugerido: `fix(server): guarda no desfazer a rodada vencida já fechada`

**Notas do agente:**
- Item 3, feito: `KeyedQueue` (uma fila em memória por eleição) no `ElectionService`; voto, comandos do admin, credenciamento, desfazer e fechamento por prazo gravam um de cada vez. Leitura sem nada a fechar não entra na fila. A chave é esquecida quando a fila esvazia, e uma gravação que falha não trava as seguintes. O `retryOnVersionConflict` ficou como rede de segurança.
- Arquivos: `src/services/{keyed-queue,election-service}.ts`, `test/services/{keyed-queue,election-write-queue}.test.ts`, `test/doubles/held-save-election-repository.ts` (+ teste).
- Como usar: método novo que grava uma eleição entra em `this.writes.run(electionId, ...)` e relê dentro da vez; nunca enfileirar de dentro de uma tarefa da mesma eleição e esperar (travaria). O prazo é julgado pela **chegada** (voto: `judgedAt`; comando: `arrivedAt`), não pela vez.
- Testes: 29 novos (fila 8, serviço 17, double 4). Antes da fila falharam 11, inclusive o de 100 votos simultâneos; os 2 de "comando que chegou na tolerância" falharam com a fila ligada sem julgar pela chegada. 18 mutações manuais, todas pegas. Servidor: 558 testes.
- Medição (Postgres 16 local, pool padrão, 3 execuções): 100 votos simultâneos **todos aceitos**, 100 gravações, ~0,4 s (histórico 0), ~0,8 s (10), ~2,2 s (50); antes da fila: 22–27 com 409 em ~1,6 / ~4,5 / ~18 s.
- Decisões: ver "Decisões e desvios". Um comando do admin, ou o credenciamento de muitos códigos, atrás de uma rajada espera a vez (e vice-versa).
- Item 1, feito: o snapshot de `commit` leva o estado sobre o qual o comando agiu (rodada vencida já fechada); o `undo` desfaz só o comando, e o seguinte volta para antes da abertura da rodada. Testes: 2 em `election-service.test.ts` (o primeiro falhou antes; o segundo garante que os passos antigos continuam, falha que uma mutação expôs); 3 mutações manuais, todas pegas. Servidor: 560 testes, 100% linhas.
- Item `allSettled` (aprovado junto): feito à parte, no mesmo commit do item 5 da revisão (ver B17).

### [x] B18 — Composição, arquivos estáticos e retomada após reinício
**Ref.:** architecture §8.3, §13.
**Fazer:**
- `src/compose.ts`: `createServer(config)` monta os adaptadores reais conforme `REPOSITORY`, roda `migrate` (se for pg), executa `seedAdmin`, cria o `io` com `createRealtimeServer()` e chama `buildApp` com `notifier: new SocketNotifier(io)` e `realtime: io` (é o `buildApp` que liga o `io` ao servidor HTTP; ver as notas da B15), e reagenda as rodadas abertas (`rescheduleOpenRounds`, usando `repo.listAll()`).
- `src/main.ts` (humilde, fora da cobertura): `loadConfig(process.env)` → `createServer` → `listen`, com encerramento gracioso em `SIGTERM`/`SIGINT`.
- **Cuidados reunidos das revisões** (detalhes nas notas da B14, da B17 e da B17b):
  - Pool do `pg`: registrar `pool.on('error', ...)` (sem ouvinte, a queda de uma conexão ociosa, comum no Neon, derruba o processo) e chamar `pool.end()` no encerramento, junto com `scheduler.cancelAll()` e `app.close()`.
  - Retomada: reagendar as rodadas abertas com `scheduler.schedule(...)` em `deadline + voteGraceMs` (horário já passado dispara logo); não chamar `handleDeadline` direto, porque ele julga sem tolerância e fecharia a rodada cedo.
  - Uma única instância do servidor: a fila de gravações por eleição (B17b) é do processo. Registre isso no `render.yaml`/`docs/deploy.md` na B21.
  - Adaptadores reais em `AppDeps`: `createCryptoCodeGenerator()` em `codeGenerator` (B11), `new TimeoutScheduler()` em `scheduler` (B14) e o logger do Fastify como `Logger` do `ElectionService` (B14).
- `http/static.ts`: `registerStatic(app, distDir)` com `@fastify/static`. Fallback para `index.html` em rotas que não são `/api` nem `/socket.io`; `/api/*` inexistente continua sendo 404 JSON.
- **Limite de tempo no banco:** o `Pool` deve ter `query_timeout` (ou `statement_timeout`). As gravações de uma eleição passam por uma fila (B17b), então uma consulta travada seguraria todas as seguintes dessa eleição.
- **Proxy reverso e rate limit:** o rate limit da A25 conta por `request.ip`. Atrás do proxy do Render, sem `trustProxy` todos os clientes aparecem com o IP do proxy e o limite pega todo mundo junto. Configure o `trustProxy` do Fastify pelo **número de proxies** na frente do servidor (variável nova no `config.ts`, padrão desligado). **Não use `trustProxy: true`**: com `true`, o Fastify usa o primeiro IP do `X-Forwarded-For`, que o próprio cliente pode forjar, e o limite vira enfeite. O valor de produção é definido na B21.

**Testes (escrever antes):**
- `registerStatic` com diretório temporário: `/` devolve o `index.html`; `/admin/eleicoes/x` também (fallback); `/api/nada` devolve 404 JSON;
- `rescheduleOpenRounds` agenda só as eleições com rodada aberta;
- `createServer` com `REPOSITORY=memory` sobe e responde `/api/health` (via `inject`);
- com 1 proxy confiável, um `X-Forwarded-For` forjado pelo cliente não muda o IP usado pelo rate limit (o 11º login no mesmo minuto ainda recebe 429).

**Commit sugerido:** `feat(server): compõe aplicação real, serve o frontend e retoma prazos após reinício`
**Notas do agente:**
- Feito: `createServer(config)` monta o servidor real (memória ou Pg com `migrate`, `systemClock`, `TimeoutScheduler`, gerador `crypto`, `randomUUID`, Socket.IO + `SocketNotifier`, admin semeado, estáticos se `WEB_DIST_DIR`) e devolve o app já `ready`; `app.close()` fecha o Socket.IO, cancela os timers e encerra o pool. `main.ts` (humilde) lê o ambiente, faz `listen` em `0.0.0.0` e fecha no `SIGTERM`/`SIGINT`. `registerStatic` serve o build com fallback para `index.html`. Nova variável `TRUST_PROXY_HOPS` (padrão 0).
- Arquivos: `src/{compose,main}.ts`, `src/http/static.ts`, `src/adapters/system-clock.ts`, `src/adapters/pg/sql.ts` (porta `DatabasePool`), `src/app.ts` (`trustProxy` e `onReady`), `src/config.ts`, `src/services/election-service.ts` (`rescheduleOpenRounds`), `test/doubles/pg-mem-pool.ts` (`createPgMemDatabasePool`); dep `@fastify/static` (prevista na §13).
- Como usar: `const app = await createServer(loadConfig(process.env)); await app.listen(...)`. Testes trocam o banco: `createServer(config, { createPool: () => createPgMemDatabasePool() })`. O pool real tem `query_timeout` de 10 s.
- Testes: 37 novos. `compose.test.ts` 12, `static.test.ts` 9, rate limit atrás de proxy 3, `rescheduleOpenRounds` 3, `app.test.ts` 1, `config.test.ts` 4 casos novos (e 2 atualizados), double do pool 5. Servidor: 597 testes, 99,84% linhas / 99,51% branches. 11 mutações manuais (sem `cancelAll`, `end`, `on('error')`, `migrate`, `query_timeout`, seed, `onReady`, reagendamento, prefixos da API), todas pegas. Smoke test real (bundle temporário do Vite, já apagado): health, fallback, 404 JSON, login semeado, handshake do Socket.IO e saída limpa no `SIGTERM`.
- Decisões: (1) o reagendamento é um gancho `onReady` no `buildApp`, e não um passo só do `createServer`: o serviço nasce dentro do `buildApp` e todo app que sobe sobre um repositório com rodada aberta precisa retomá-la; nenhum teste antigo mudou. (2) **Fastify 5.12 recusa `trustProxy` numérico** (passou a não confiar em nada); a contagem de saltos virou a função `(_, hop) => hop < hops`. A própria doc do Fastify avisa que contar saltos só é seguro se o servidor não for alcançável sem passar pelo proxy: conferir isso no Render na B21. (3) A escolha do Pg é pelo `REPOSITORY`, não pela presença do `DATABASE_URL` (bug achado na própria tarefa, com teste de regressão antes). (4) O fallback só vale para `GET`; `/api` e `/socket.io` sem rota continuam 404 JSON. (5) Linha sem cobertura: só a fábrica padrão `new Pool(options)` (precisa de Postgres real). (6) Um arquivo do build que falta (ex.: `/assets/x.js`) recebe o `index.html`, como todo fallback de SPA.

### [x] B20 — Build de produção
**Ref.:** architecture §13, §14.
**Fazer:**
- Build do servidor com `tsup`: entrada `src/main.ts`, saída `apps/server/dist/main.js`, `target node24`, empacotando os workspaces `@voto/*` (`noExternal`).
- Scripts raiz: `build` (web e depois server) e `start` (`node apps/server/dist/main.js`). O servidor serve `apps/web/dist` por padrão.
- Adicionar `npm run build` ao `ci.yml`, depois dos testes e **antes** do passo "Upload Playwright report" (A26), que precisa continuar sendo o último.
- **Cuidados vindos da B18:**
  - O `createServer` só serve o front se `WEB_DIST_DIR` estiver definido (não há padrão no código). Para "servir `apps/web/dist` por padrão", defina o caminho no script `start` (de forma multiplataforma, ex.: `cross-env`) ou dê ao `config.ts` um padrão resolvido a partir do pacote, com teste. Não dependa da pasta de onde o comando é rodado.
  - O `main.ts` usa `await` no topo do módulo: o bundle precisa sair em **ESM** (`format: 'esm'`).
  - O `pg` tem um import opcional de `pg-native`, que não está instalado: deixe-o de fora do bundle (`external`), senão o build falha.

**Testes (escrever antes):** é uma tarefa de configuração. Verifique localmente que `npm run build` e `npm start` sobem o servidor e que `GET /api/health` e `GET /` respondem. Descreva nas notas o comando usado para conferir.
**Pronto quando:** o build passa no CI dos 3 SOs.
**Commit sugerido:** `build: gera build de produção do servidor e do frontend`
**Notas do agente:**
- Feito: `npm run build` gera `apps/web/dist` (Vite) e `apps/server/dist/main.js` (tsup, ESM, `node24`, com sourcemap; só os `@voto/*` entram no pacote, o resto vem do `node_modules`). `npm start` roda `cross-env WEB_DIST_DIR=apps/web/dist node apps/server/dist/main.js`. Passo `Build` no `ci.yml`, depois dos uploads do Codecov e antes do upload do relatório do Playwright (que segue sendo o último).
- Arquivos: `apps/server/tsup.config.ts`, `apps/server/{package.json,tsconfig.json}` (script `build`, dep `tsup`; config no typecheck), `package.json` (scripts `build`/`start`, dep `cross-env`), `.github/workflows/ci.yml`, `package-lock.json` (só pacotes novos, nenhuma versão existente mudou).
- Como usar: `npm run build && npm start` (porta pelo `PORT`; demais variáveis como na B18). Rodar `node apps/server/dist/main.js` direto também sobe, mas sem o front, a menos que `WEB_DIST_DIR` esteja definido.
- Testes: nenhum automatizado novo (tarefa de configuração, como o TO-DO prevê). Conferência manual: `npm run build`, depois `PORT=3999 npm start` e `curl` em `/api/health` (200 `{"status":"ok"}`), `/` (200, `index.html`), `/admin/elections/x` (200, fallback), `/assets/index-*.js` (200, JS), `/api/nothing` (404 JSON `NOT_FOUND`) e `/socket.io/?EIO=4&transport=polling` (handshake 200); `SIGTERM` no processo → log `Shutting down` e saída sem erro. Imports externos do bundle conferidos (`fastify`, `pg`, `socket.io`, `zod`... e nenhum `@voto/`). Suítes inalteradas: servidor 597, domínio 223, shared 138, web 2; `lint`, `format:check`, `typecheck` e `test:coverage` verdes.
- Decisões: (1) o "servir `apps/web/dist` por padrão" é o `start` definir `WEB_DIST_DIR` com caminho relativo: o `npm` roda o script na raiz do repositório de qualquer pasta, e o `createServer` já faz `resolve` (B18), então nada mudou no código de produção. (2) `shared` e `domain` não têm build próprio (a §14 cita os quatro): exportam o `.ts` e entram no bundle do servidor (e no do Vite). (3) `pg-native` fica `external` de forma explícita, embora o `pg` inteiro já seja externo. (4) O tsup avisa que não é mais mantido (sugere o tsdown); fica o tsup, que é o previsto na tarefa e funciona com o esbuild 0.28. (5) **Pronto quando** depende do CI nos 3 SOs, que só roda após o push do usuário.

### [x] B20b — Correções da revisão geral pós-B20
**Fazer** (achados na revisão geral do servidor depois da B20, pedidos pelo usuário em 2026-11-25; teste de regressão primeiro e um commit por item):
- **Item 1 — POST sem corpo com `Content-Type: application/json`** (✔ feito): o parser padrão do Fastify recusava o corpo vazio com 400 `VALIDATION_ERROR` ("Body cannot be empty...") antes de chegar à rota. Afetava as rotas sem corpo (open, close, release, defer, annul, undo, finish, anexar candidato) e o runoff (corpo opcional), e o front manda esse cabeçalho em todo POST.
  - Commit sugerido: `fix(server): aceita POST com corpo JSON vazio nas rotas sem corpo`
- **Item 2 — segredo JWT de desenvolvimento com banco real** (✔ feito): fora de `NODE_ENV=production`, o `JWT_SECRET` caía para a constante de dev, que está no repositório, e qualquer um forjaria token de admin; o aviso da B20 sobre `npm ci` empurrava para não definir `NODE_ENV` no Render. Agora `REPOSITORY=pg` exige `JWT_SECRET` em qualquer ambiente (banco real = ambiente real); a memória em dev e teste segue com o segredo fixo. A B21 passou a exigir `NODE_ENV=production`, o build com `--include=dev` e o passo 8 do checklist.
  - Commit sugerido: `fix(server): exige JWT_SECRET sempre que o repositório é pg`

**Notas do agente:**
- Item 1, feito: `registerLenientJsonBody(app)` troca o parser de `application/json` por um que entrega corpo vazio como `undefined` e repassa o resto ao parser padrão do Fastify (`getDefaultJsonParser('error', 'error')`, com a proteção contra `__proto__`/`constructor`). Ligado no `buildApp` logo depois do tratamento de erros. As rotas que exigem corpo continuam com 400 pelo Zod; JSON malformado continua 400.
- Arquivos: `src/http/json-body.ts` (novo), `src/app.ts`, `test/app.test.ts` (+1), `test/http/resolution-routes.test.ts` (+2).
- Testes: 3 novos (`undo` e `runoff` com o cabeçalho e sem corpo; rota com schema recusa o corpo JSON vazio igual a um corpo ausente). Os 3 falharam antes da correção e de novo com a chamada desligada; o de JSON malformado (já existente) segue verde. Servidor: 600 testes, 99,84% linhas / 99,51% branches.
- Decisões: (1) o teste do schema compara com a resposta da mesma rota sem corpo, em vez de fixar o texto do Zod: a 1ª versão esperava a mensagem com o campo `name`, mas um corpo ausente o Zod acusa no nível do objeto ("expected object, received undefined"). (2) Só o texto vazio vira ausente; espaços em branco seguem para o parser padrão (400).
- Item 2, feito: o `superRefine` do `loadConfig` acusa `JWT_SECRET: is required when REPOSITORY is pg` fora de produção (em produção já sai `is required in production`, sem repetir o aviso). Nada mudou no `compose.ts`: a `Config` sempre tem um `jwtSecret`, e quem impede o segredo de dev com banco real é o `loadConfig`.
- Arquivos: `src/config.ts`, `test/config.test.ts` (+3), `test/compose.test.ts` (o `PG_ENV` ganhou `JWT_SECRET`, porque o requisito mudou; nenhuma asserção mudou), `docs/todo-backend.md` (B21).
- Testes: 3 novos. Os 2 do `it.each` (`development` e `test`) falharam antes ("expected [Function] to throw"); depois da correção, os 7 testes do `compose.test.ts` com `PG_ENV` falharam até ele ganhar o segredo. O 3º (produção com pg avisa a falta do `JWT_SECRET` uma vez só) veio do relatório de cobertura (ramo sem teste) e falha com a mutação que repete o aviso. Os de memória em dev/teste e de pg com segredo fora de produção (já existentes) seguem verdes. Servidor: 603 testes, 99,85% linhas / 99,52% branches.

### [x] B21 — Deploy contínuo (Render + Neon)
**Ref.:** architecture §12, §13.
**Fazer:**
- `render.yaml` (Blueprint) com build `npm ci --include=dev && npm run build`, start `npm start`, health check em `/api/health` e as variáveis da §13 (os valores secretos ficam fora do arquivo). Inclui a variável de proxy da B18 com o número de proxies do Render (confirmar na documentação do Render ou olhando o `X-Forwarded-For` que chega em produção) e `RATE_LIMIT` ligado. A variável é `TRUST_PROXY_HOPS`; como o Fastify 5.12 considera a contagem de saltos insegura quando o servidor é alcançável sem o proxy, confirme também que o serviço do Render só recebe tráfego pelo proxy dele (ver notas da B18).
- **Uma instância só:** o serviço do Render não pode escalar para mais de uma instância (a fila de gravações por eleição da B17b é do processo). Deixe isso explícito no `render.yaml` e no `docs/deploy.md`.
- **Esquema do banco congelado após o 1º deploy:** o `migrate` só tem `CREATE TABLE IF NOT EXISTS`, que não altera tabela já existente (ver notas da B17). Qualquer mudança de esquema depois disso precisa de um `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no `migrate`, com teste de que roda num banco do esquema anterior.
- `.github/workflows/deploy.yml`: dispara em `workflow_run` do CI com `conclusion == success` na `main` e chama `curl -fsS -X POST "$RENDER_DEPLOY_HOOK"` (secret).
- `docs/deploy.md`: checklist dos passos manuais **do usuário**:
  1. criar o banco no Neon e copiar a `DATABASE_URL`;
  2. criar o serviço no Render, definir as variáveis e desligar o auto-deploy;
  3. criar o secret `RENDER_DEPLOY_HOOK` no GitHub;
  4. conferir `/api/health` em produção;
  5. conferir o rate limit em produção: o 11º login errado no mesmo minuto recebe 429, e um segundo aparelho (outra rede) ainda consegue logar;
  6. conferir uma rodada com vários celulares votando ao mesmo tempo (a rajada só foi medida num Postgres local, não no Neon; ver B13b e B17b);
  7. saber que o admin é semeado **só na primeira subida**: se o usuário já existe no banco, a senha guardada é mantida (B18). Trocar `ADMIN_PASSWORD` no Render depois disso não muda a senha; escreva no checklist como trocar, se for preciso;
  8. conferir que um token de admin assinado com o segredo de desenvolvimento (`DEV_JWT_SECRET` do `config.ts`, que está no repositório) é **recusado** em produção: `GET /api/admin/me` com ele responde 401. Escreva no checklist como gerar esse token (ex.: um comando `node` com o `jose`).
- **`NODE_ENV=production` nas variáveis de execução do Render** (obrigatório, B20b): é o que exige `JWT_SECRET`, `ADMIN_USERNAME` e `ADMIN_PASSWORD`. O `REPOSITORY=pg` também exige `JWT_SECRET` mesmo fora de produção, mas sem `NODE_ENV=production` o admin não é exigido e o Fastify loga como em dev.
- **Build com `npm ci --include=dev && npm run build`** (B20/B20b): no Render as variáveis valem também no build, e com `NODE_ENV=production` o `npm ci` omite as `devDependencies` (`vite`, `tsup` e o `cross-env` do `start`). O start deve ser `npm start` (que define `WEB_DIST_DIR`), e não `node apps/server/dist/main.js` direto, senão o front não é servido.
- O primeiro deploy com `REPOSITORY=pg` é também o primeiro uso do `new Pool(...)` real (a única linha sem cobertura da B18): confira nos logs do Render que o `migrate` rodou sem erro.

**Testes (escrever antes):** não se aplica (infraestrutura). A validação é o usuário seguir o checklist e a URL de produção responder.
**Pronto quando:** o usuário confirmar a aplicação no ar (marco M2). Registre a URL nas notas.
**Commit sugerido:** `ci: publica em produção no Render após CI verde na main`
**Notas do agente:**
- Situação (2026-11-26): **no ar** (marco M2) em https://voto-jn8l.onrender.com, criado pelo Blueprint; o workflow `Deploy` ficou verde depois de criado o secret (commit `69dc670`).
- Conferências em produção: health, front, rota do front e 404 em JSON ok; `TRUST_PROXY_HOPS` medido = **3** (com 1, 12 logins errados davam só 401); com 3, 429 no 11º login e, com `X-Forwarded-For` forjado diferente a cada tentativa, o limite continua valendo; depois do 429, o login do admin a partir de outra rede respondeu 200 (passo 7 completo, conferido pelo usuário); token assinado com o segredo de dev → 401; 50 votos simultâneos no Neon, todos aceitos (o mais lento em 1,8 s), apuração 25 a 25 e painel atualizado pelo Socket.IO (eleitores simulados por script, de uma máquina só). **Não conferido:** rodada com celulares reais pela interface (passo 8; depende das telas do C, fica para o teste do grupo, G3).
- Feito: Blueprint `render.yaml` (web `free`, `virginia`, `branch: main`, build `npm ci --include=dev && npm run build`, start `npm start`, health `/api/health`, `numInstances: 1`, `autoDeployTrigger: 'off'`, `NODE_ENV=production`, `REPOSITORY=pg`, `RATE_LIMIT=on`, `TRUST_PROXY_HOPS=3` (1 no primeiro deploy, corrigido pela medição); `DATABASE_URL`/`ADMIN_*` com `sync: false` e `JWT_SECRET` com `generateValue`). Workflow `deploy.yml` (`workflow_run` do CI na `main`, só `push` e `success`, `permissions: {}`, fila sem cancelamento) que faz `POST` no hook com `&ref=<head_sha>`. Checklist do usuário em `docs/deploy.md`.
- Arquivos: `render.yaml`, `.github/workflows/deploy.yml`, `docs/deploy.md` (novos). Nenhum código de produção mudou. Depois da medição: `render.yaml` com `TRUST_PROXY_HOPS=3`; `docs/deploy.md` com o valor medido e o sintoma real de valor baixo demais (nenhum 429, porque o IP do proxy varia), no passo 7 e em "Problemas comuns".
- Como usar: merge na `main` → CI verde → `Deploy` publica o commit aprovado. Secret `RENDER_DEPLOY_HOOK` = URL do hook como o Render mostra (`...?key=...`).
- Testes: nenhum automatizado (infraestrutura). Conferências locais: `render.yaml` válido no JSON Schema oficial do Render (`render.com/schema/render.yaml.json`; uma variante com `autoDeployTrigger` inválido é recusada); `deploy.yml` e `ci.yml` válidos no schema do SchemaStore; o passo do `deploy.yml` rodado num servidor HTTP local (sem secret: erro e saída 1; com secret: `POST /deploy/srv-test?key=secret&ref=abc123`); os comandos do checklist rodados contra o build local (token de dev → 200 em dev; 10×401 e 429 no 11º login; hash bcrypt confere); log do Fastify mostra em `remoteAddress` o IP já resolvido pelo `trustProxy` (com 1 salto e `X-Forwarded-For: 203.0.113.7, 198.51.100.2`, saiu `198.51.100.2`). Suítes inalteradas e verdes: servidor 607, domínio 223, shared 138, web 2; `lint`, `format:check`, `typecheck`, `test:coverage`.
- Decisões: (1) **`TRUST_PROXY_HOPS` não está na documentação do Render** (não diz quantos saltos; a comunidade relata 1, 2 e 3, e que o Render acrescenta ao `X-Forwarded-For` do cliente sem apagá-lo). Foi medido em produção pelo passo 6 do checklist (`remoteAddress` do log, com um IP forjado): **3**. O serviço só é alcançável pelo proxy (doc "Web Services" do Render), o que torna a contagem segura. (2) O hook leva `ref=<sha>` (aceito pelo Render em serviços com Git): publica o commit que o CI aprovou, não o último da `main`. (3) `on`/`off` entre aspas no YAML: sem elas, YAML 1.1 lê como booleano. (4) Neon com conexão direta (sem pooler) e `sslmode=verify-full` (o `pg` 8 avisa que `require` mudará de sentido no v9). (5) Troca de senha do admin por `UPDATE` do hash, sem apagar a linha (as eleições guardam o `admin_id`). (6) A conferência do token de dev usa `GET /api/elections`: `GET /api/admin/me` dá 401 também para token válido de admin inexistente e não provaria nada. (7) O 1º `Deploy` após o merge falha de propósito (secret ainda não existe), com mensagem clara; o checklist manda rodá-lo de novo.

### [ ] B16b — Cenários de integração HTTP avançados
**Depende de:** nada pendente (A15–A20 já prontas).
**Fazer:** novos testes de integração só por HTTP com o domínio real, um arquivo por cenário:
- 2º turno: 3 candidatos e votos divididos → `AWAITING_RUNOFF` → `runoff` → eleito;
- exclusão do eleito: eleito no cargo A não aparece na cédula do cargo B;
- candidatos insuficientes: `next` → `INSUFFICIENT_CANDIDATES` → anexar existente / adiar / cancelar;
- resiliência: `undo` depois de liberar o resultado; `annul` de uma rodada;
- persistência: o mesmo fluxo básico com o `PgElectionRepository` sobre `pg-mem` (`createMigratedPgMemPool`, ver notas da B17).

Reaproveite os passos nomeados da B16a (`logIn`, `createMayorRace`, `castVote`...), movendo-os para `test/support/` se mais de um arquivo precisar deles. No cenário de resiliência, lembre a regra atual do desfazer (B13b e B17b): voto e fechamento por prazo **não** são passos; desfazer um passo do admin descarta os votos registrados depois dele.

**Commit sugerido:** `test(server): cobre segundo turno, candidatos insuficientes e desfazer com domínio real`
**Notas do agente:** _pendente_

### [ ] B23 — Revisão final da parte B
**Ref.:** architecture §10.3; aula 11 (test smells).
**Fazer:**
- Revisar a suíte do servidor procurando *test smells* (Assertion Roulette, Conditional Test Logic, Magic Number, Mystery Guest, General Fixture, Sleepy Test, testes ignorados) e corrigir.
- Garantir cobertura ≥ 85% no `apps/server` e ≥ 80% no `shared`.
- `docs/api.md`: referência curta das rotas e eventos, com exemplo de requisição e resposta. Atualizar o `architecture.md` onde a implementação divergiu (com aprovação do usuário).
- Escrever no README as subseções da parte B (Tecnologias do backend/CI; Execução dos testes: comandos).
- Avaliar o `rate-limit.ts` (A25): o `Map` de contadores ganha uma entrada por rota e IP e nunca apaga as janelas vencidas. Se valer a pena, descartar as vencidas (com teste antes, usando o `FakeClock`) e combinar com o A, autor do arquivo.
- Pontas soltas das revisões (avaliar e, se valer a pena, corrigir com teste antes; senão, registrar o motivo nas notas):
  - `TimeoutScheduler` (B14, decisão 5): duas mutações sobrevivem, a remoção do `timers.delete` no disparo (vazamento de memória) e a do `Math.min` (laço de timers de 1 ms). Falta um teste que observe isso, por exemplo uma contagem de tarefas pendentes depois do disparo.
  - Gravação no Postgres (B17, pendência c): cada voto ainda regrava o registro inteiro, e o `save` apaga e reinsere todos os `voter_codes` da eleição mesmo quando os códigos não mudaram. Dá para pular a reescrita dos códigos quando o conjunto for o mesmo.
  - Fallback do front (B18, decisão 6): um arquivo do build que falta (ex.: `/assets/app-antigo.js`, pedido por uma aba aberta antes de um deploy) recebe o `index.html` com 200, e o navegador tenta rodar HTML como JavaScript. Avaliar responder 404 para caminhos com extensão de arquivo.
**Notas do agente:** _pendente_

---

## Decisões e desvios

> Registro, mantido pelo agente, de decisões aprovadas pelo usuário que mudam ou detalham o `architecture.md`. Formato: `AAAA-MM-DD — tarefa — decisão — motivo`.

- 2026-11-22 — planejamento — o repositório guarda `ElectionRecord = History<Election>` (atual + snapshots), não só a `Election`. Assim o desfazer sobrevive a reinícios. Detalha a §8.1.
- 2026-11-22 — planejamento — os códigos de eleitor são **únicos globalmente**, não só por eleição, porque o eleitor entra apenas com o código. Garantido pelo serviço (B11) e pela chave primária de `voter_codes` (B17). Detalha a §5.5.
- ~~2026-11-22 — planejamento — o domínio é injetado no servidor (`AppDeps.domain: DomainApi`) para permitir stubs antes do marco M1.~~ **Revogada em 2026-11-23**: o domínio ficou pronto antes do Sprint 0, então o servidor o importa direto e testa com ele real (real > fake > stub > mock).
- 2026-11-23 — replanejamento — o Sprint 0 integra o `packages/domain` já existente (TS 7, Vitest 5): S0.1 e S0.2 absorvem as configs, S0.3a move `model.ts` para `@voto/shared`, e a S0.4 virou "servidor enxergando o domínio real". As assinaturas reais do domínio (`todo-domain.md`, "Decisões e desvios") valem mais que a §5.2.
- 2026-11-23 — replanejamento — o servidor incrementa `election.version` ao salvar (o domínio mantém o campo, mas não o altera).
- 2026-11-23 — S0.1 — `typescript-eslint` 8.73 aborta com TS 7 (peer `<6.1`), mesmo na config sem regras de tipos. Solução do post oficial do TS 7: na raiz, `"typescript": "npm:@typescript/typescript6@^6.0.2"` (API usada pelo ESLint) e `"@typescript/native": "npm:typescript@^7.0.2"` (fornece o `tsc` 7). Sem `legacy-peer-deps`. Remover o alias quando o typescript-eslint suportar TS 7.1 (issue #10940).
- 2026-11-24 — B15 — `attachRealtime(io, httpServer, deps)` recebe o `io` já criado (`createRealtimeServer`) e `AppDeps` ganhou `realtime?: RealtimeServer`, ligado pelo `buildApp`; quebra o ciclo notificador → io → app. Detalha a §8.1.
- 2026-11-23 — S0.3a — `ElectionSummaryDTO` (citado na §6.1, mas sem forma na §6.3) é `{ id, name, status, positionCount, voterCount }`; basta para a lista de eleições do admin. `ErrorDTO.error.code` é `ErrorCode` (a §6.3 dizia `string`), para o front checar códigos com o compilador. `RoundResultDTO` não tem `positionId` (como o `RoundResultView` do domínio).
- 2026-11-25 — correção pós-B17 — o voto que dá `VERSION_CONFLICT` é reaplicado sobre a eleição relida, até 50 tentativas, com o prazo julgado pela chegada; só o voto (admin continua com 409 imediato). Detalha a §8.2.
- 2026-11-25 — correção pós-B17 (aprovada) — o voto **não conta como passo do desfazer**: grava com versão + 1, sem snapshot. Detalha a §5.4 (“snapshot a cada comando que muda estado”) e o passo 6 da §8.2. Motivo: o desfazer é do admin; um snapshot por voto expulsava as decisões dele do histórico (limite 50) e regravava até 50 cópias da eleição por voto. Consequência: desfazer um passo descarta os votos registrados depois dele.
- 2026-11-25 — correção pós-B17 — o fechamento por prazo vencido em leituras e comandos usa a mesma tolerância do voto (`deadline + voteGraceMs`); só o timer, que já dispara nesse horário, julga sem desconto. Detalha a §8.3.
- 2026-11-25 — correção pós-B17 (aprovada) — o **fechamento automático** por prazo (timer ou leitura) também não conta como passo do desfazer. Detalha a §5.4. Consequência: o `undo` depois dele descarta a rodada inteira, voltando ao estado anterior à abertura.
- 2026-11-25 — correção pós-B17 — um `VERSION_CONFLICT` no fechamento por prazo (leituras e timer) não vira erro: o serviço relê e devolve o estado atual, até 50 tentativas. Detalha a §8.2 e a §8.3.
- 2026-11-25 — correção pós-B17 (aprovada) — a ordem das listagens é a de criação, garantida pelo repositório (coluna `creation_order` em `elections`), sem `createdAt` em `Election`: não muda o `shared` nem o domínio. Detalha a §8.1 e a §13.
- 2026-11-25 — B17b (aprovada) — as gravações de uma mesma eleição (votos, fechamento por prazo e comandos do admin) passam por uma **fila em memória por eleição**, uma de cada vez, sem dependência nova; o prazo é julgado pela chegada do pedido. **Vale só para uma instância do servidor** (como as salas do Socket.IO, §13): com mais de uma, volta a haver disputa, coberta apenas pela conferência de versão e pela nova tentativa. Detalha a §8.2.
- 2026-11-25 — B17b (aprovada) — o passo do desfazer de um comando guarda a eleição já com o prazo vencido aplicado: o fechamento automático não é desfeito junto, mesmo quando é o comando que o grava. Detalha a §5.4.
- 2026-11-25 — A25 (feita pelo A) — o rate limit é um hook próprio (`http/rate-limit.ts`) com a porta `Clock`, e não o `@fastify/rate-limit` da §8.4: a janela fica testável com o `FakeClock` e não entra dependência nova. Veio junto a variável `RATE_LIMIT` (`on`/`off`, padrão `on`) no `config.ts`; os e2e (C17) sobem o servidor com `RATE_LIMIT=off`, porque todos os navegadores do teste saem do mesmo IP. Pendências do lado B: `trustProxy` pelo número de proxies (B18/B21) e avaliar a limpeza dos contadores (B23).
- 2026-11-25 — A26 (feita pelo A) — o `ci.yml` ganhou, no fim, o upload do `e2e/playwright-report/` quando o job falha (`if-no-files-found: ignore`). Os passos de e2e da C22 entram antes dele.
- 2026-11-25 — B18 — o `buildApp` reagenda as rodadas abertas num gancho `onReady` (o `createServer` só chama `ready`), porque o `ElectionService` nasce dentro dele. A confiança no proxy é a variável `TRUST_PROXY_HOPS` (padrão 0) aplicada como função de saltos, já que o Fastify 5.12 recusa o número puro. Detalha a §8.3 e a §8.4.
- 2026-11-25 — B20 — `shared` e `domain` não têm build próprio: entram no bundle do servidor (tsup, `noExternal: [/^@voto\//]`) e no do Vite. O front é servido porque o `npm start` define `WEB_DIST_DIR=apps/web/dist`; o comando de start do Render passa a ser `npm start`. Detalha a §13 e a §14.
- 2026-11-25 — B20b — um POST com `Content-Type: application/json` e corpo vazio é tratado como sem corpo (parser próprio sobre o padrão do Fastify); quem exige corpo o recusa pelo Zod. Detalha a §6.
- 2026-11-25 — B20b — `REPOSITORY=pg` exige `JWT_SECRET` mesmo fora de produção (banco real = ambiente real); o segredo fixo de dev só vale com memória em dev e teste. No Render, `NODE_ENV=production` é obrigatório e o build é `npm ci --include=dev && npm run build`. Detalha a §8.4 e a §13.
- 2026-11-26 — B21 — o deploy chama o hook do Render com `ref=<sha>` do commit que passou no CI (e não o último da `main`); o `TRUST_PROXY_HOPS` de produção foi medido no 1º deploy (valor inicial 1, corrigido para 3), porque o Render não documenta quantos proxies acrescenta ao `X-Forwarded-For`. Detalha a §12 e a §13.
