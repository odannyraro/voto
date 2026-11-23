# Voto — Divisão de tarefas

Este documento complementa o [architecture.md](architecture.md) e divide o trabalho entre os três integrantes. As seções citadas como "§x" são seções do architecture.md. A divisão é **por camada**, com contratos definidos antes. Cada pessoa é dona de pastas diferentes, então quase não há conflito de merge. Também ninguém precisa esperar o código de outra pessoa para escrever e testar o seu: quem depende de outra parte usa *test doubles* até a integração.

> **Situação em 2026-11-23:** A ficou com o domínio e já entregou A1–A24 na branch `feat/domain` (205 testes, cobertura ~97%), antes do Sprint 0. Por isso o Sprint 0 passou a **integrar** esse pacote ao monorepo (detalhes no [todo-backend.md](todo-backend.md)). Pendentes de A: A25 (depois da B6 e da B13) e A26 (depois da S0.6). C ficou com o Daniel; B com o Gustavo.

| Integrante | Área | Pastas de que é dono | Testes principais |
|---|---|---|---|
| **A** | Domínio: regras da eleição | `packages/domain` | Unidade (muitos), mutação |
| **B** | Backend + infraestrutura | raiz do monorepo, `packages/shared`, `apps/server`, `.github/`, deploy | Unidade com doubles, integração HTTP/socket/banco |
| **C** | Frontend + e2e | `apps/web`, `e2e/` | Componente (RTL + MSW), e2e (Playwright) |

Tarefas do grupo todo (README final, vídeo, revisão cruzada) estão na seção 6.

---

## 1. Regras de convivência

1. **Pastas têm dono.** Só o dono altera uma pasta. Se precisar de algo na pasta de outra pessoa, peça na issue ou no PR dela.
2. **Contratos (`packages/shared`) são de B**, mas qualquer mudança é combinada no grupo antes. Ela entra em um PR próprio (`feat(shared): ...`) e é avisada no chat do grupo.
3. **Arquivos da raiz** (`package.json` raiz, `tsconfig.base.json`, `eslint.config.js`, workflows) são de B. Dependências de um workspace são instaladas no próprio workspace (`npm i -w apps/web <pacote>`). Isso altera só o `package.json` dele e o `package-lock.json`. Conflito no lock se resolve rodando `npm install` de novo.
4. **Fluxo Git:** uma branch por tarefa (`feat/<area>-<nº>-<slug>`, ex.: `feat/domain-07-tally`). PR pequeno para a `main`, merge só com CI verde, *merge commit* (sem squash), **um commit por tarefa**.
5. **A `main` sempre compila e passa nos testes.**
6. **TO-DO do agente:** cada integrante mantém `docs/todo-<area>.md` (`todo-domain.md`, `todo-backend.md`, `todo-frontend.md`) com as tarefas abaixo detalhadas e as notas do agente.

---

## 2. Ordem no tempo e pontos de integração

```
Dias 1–2      B: Sprint 0 (S0.1–S0.6) ─────► main com a base comum (todos os workspaces rodando, contratos e CI)
              B: já segue para B1, B2, ...      (A e C ainda não começaram)
Semana 1–2    A: domínio puro         B: servidor com doubles do domínio   C: telas com MSW + socket fake
Marco M1      A conclui A1–A14 (API pública do domínio funcionando)
Semana 2–3    B: troca os doubles pelo domínio real (B16)    C: segue nas telas    A: A25 (após B6 e B13)
Marco M2      B publica o servidor integrado + deploy (B20–B21)
Semana 3–4    C: e2e contra o servidor real (C17–C22)     A: mutação, A26     B: hardening
Marco M3      Todos: README, vídeo, revisão cruzada
```

| Dependência | Quem espera | O que faz enquanto isso |
|---|---|---|
| Sprint 0 (base comum) | A, C | Nada: o Sprint 0 fica pronto antes de eles começarem |
| Domínio real (M1) | B | **Já atingido** (2026-11-23): A entregou A1–A24 antes do Sprint 0, então o servidor usa o domínio real desde o início |
| Rotas de login e de eleitor (B6, B13) | A (tarefa A25) | A24 e as anteriores; a A25 fica para o fim |
| Servidor real (M2) | C (tarefas de e2e) | C2–C16 usam MSW e socket fake |

Fora a A25, nenhuma tarefa de A depende de B ou C.

---

## 3. Integrante A — Domínio (`packages/domain`)

Tudo são funções puras, testadas por TDD. Meta: cerca de 80 testes de unidade e cobertura ≥ 95%. As regras estão na §5.4 do architecture.md.

| # | Tarefa | Entrega |
|---|---|---|
| A1 | Fundações: `Result<T>`, `DomainError` + catálogo de códigos, `DomainContext` | `errors.ts`, `result.ts` |
| A2 | *Test data builders* (`anElection()`, `aCandidate()`, `aPosition()`, `aRound()`) e `FixedContext` (relógio e ids determinísticos) | `test/builders/` |
| A3 | `createElection` e edição de dados da eleição (nome, prazo padrão) com validação | `election/` |
| A4 | Cargos: adicionar, editar, remover (só em `DRAFT`), com regra de desempate válida | `election/positions.ts` |
| A5 | Candidatos: criar, editar, remover, validar `applications` e `firstChoicePositionId` | `election/candidates.ts` |
| A6 | Credenciamento: `credentialVoters` com `CodeGenerator` injetado, unicidade de código, revogação | `election/voters.ts` |
| A7 | Gerador de códigos puro (alfabeto sem caracteres ambíguos, tamanho 8) recebendo uma fonte de aleatoriedade injetada | `voters/code.ts` |
| A8 | Elegibilidade: aptos por cargo, exclusão de quem já foi eleito, `attachExistingCandidate` | `eligibility/` |
| A9 | Desempate (Strategy): `YOUNGEST`, `OLDEST`, `MOST_REMAINING_TIME` + fallback por `createdAt` | `tiebreak/` |
| A10 | Apuração do 1º turno: contagem, válidos × brancos, maioria > 50%, casos de 1 e 2 candidatos | `tally/compute-result.ts` |
| A11 | Corte para o 2º turno com empates na fronteira (empate triplo ou maior) | `tally/runoff-cut.ts` |
| A12 | Ciclo da rodada: `openElection`, `openRound` (cédula e eleitores congelados, uma rodada por vez) | `election/rounds.ts` |
| A13 | Votação: `castVote` (apto, voto único, prazo, sigilo: `votedVoterIds` separado de `tally`) | `election/vote.ts` |
| A14 | Fechamento: `closeRoundIfDue`, `closeRound` manual, aplicação do resultado ao cargo (`DECIDED` / `AWAITING_RUNOFF` / `NO_VALID_VOTES`) → **marco M1** | `election/close.ts` |
| A15 | 2º turno: `openRunoff` e apuração do 2º turno com desempate | `election/runoff.ts` |
| A16 | Liberação de resultados (`releaseResults`) e visões por papel (o que o eleitor pode ver) | `views/` |
| A17 | Fila: `nextPositionStatus` (`READY` / `INSUFFICIENT_CANDIDATES` / `NONE_LEFT`...), `applyOrder` | `ordering/queue.ts` |
| A18 | Candidatos insuficientes: `deferPosition` e `cancelPosition` (com `confirmTitle`) | `election/position-actions.ts` |
| A19 | Algoritmo `suggestOrder` (conflitos → disputa → primeira opção, ordenação estável) | `ordering/suggest.ts` |
| A20 | Resiliência: histórico de snapshots (`push`, `undo`, limite 50) e `annulRound` | `history/` |
| A21 | `finishElection` e invariantes finais (não há rodada aberta etc.) | `election/finish.ts` |
| A22 | Teste de cenário completo da eleição só com a API pública (vários cargos, 2º turno, exclusão de eleito) | `test/scenarios/` |
| A23 | StrykerJS no domínio: rodar, matar mutantes sobreviventes relevantes e registrar o *mutation score* | `stryker.config.json` |
| A24 | Revisão de *test smells* e refatoração da suíte (nomes, AAA, magic numbers) + `README` do pacote | — |
| A25 | *(vinda da B19)* Rate limit em `POST /api/admin/login` e `POST /api/voter/session` com `@fastify/rate-limit` + testes de integração (a tentativa N+1 recebe `429`) | `apps/server/src/http/rate-limit.ts` |
| A26 | *(vinda da B22)* `codecov.yml` (flags `domain`/`server`/`web`, meta de 80%, comentário em PR), badges no README, relatório do Playwright como artefato do CI | `codecov.yml`, `.github/workflows/ci.yml` |

A25 e A26 são as únicas tarefas de A fora de `packages/domain`. Por isso, fogem da regra "cada pasta tem um dono":
- A25 fica num arquivo próprio (`rate-limit.ts`), registrado no `buildApp` com uma linha. Faça depois da B6 e da B13 (as rotas precisam existir) e avise B antes do PR.
- A26 altera só o passo do Codecov e o de artefatos do `ci.yml`. Combine com B para não editarem o workflow ao mesmo tempo.

---

## 4. Integrante B — Backend + infraestrutura

Os serviços ficam atrás de portas, e os testes usam Fake, Stub, Spy e Dummy (§8.1). Meta: cerca de 50 testes de unidade e integração e cobertura ≥ 85%.

**Sprint 0 (feito antes de A e C começarem): a base comum**

O objetivo é que A e C abram o projeto e só "preencham os vazios": tudo compila, todo workspace já tem um teste rodando e o CI está verde desde o primeiro commit deles.

| # | Tarefa | Entrega |
|---|---|---|
| S0.1 | Monorepo: npm workspaces, `tsconfig.base`, ESLint (com a regra de direção de imports), Prettier, `.nvmrc`, scripts raiz | raiz |
| S0.2 | Vitest + cobertura v8 com limite de 80% em cada workspace, com um teste "fumaça" em cada | configs |
| S0.3 | `packages/shared`: DTOs, schemas Zod e constantes de eventos (§5.1, §6, §7), com testes dos schemas | `packages/shared` |
| S0.4 | Servidor enxergando o domínio real: teste de contrato `DOMAIN_ERROR_CODES` ⊂ `ERROR_CODES` e mapeamento de códigos para status HTTP (a versão antiga, com stubs, ficou desnecessária) | `apps/server` |
| S0.5 | Esqueleto do `apps/web`: Vite + React + Router, Vitest com jsdom + RTL + user-event, proxy de `/api` e `/socket.io`, uma página "Olá" com teste de fumaça | `apps/web` |
| S0.6 | `ci.yml` com matriz de 3 SOs (lint, typecheck, testes com cobertura) + upload no Codecov | `.github/` |

Depois do Sprint 0, `packages/domain` passa a ser só de A e `apps/web` só de C.

**Servidor:**

| # | Tarefa | Entrega |
|---|---|---|
| B1 | Portas (`ElectionRepository`, `AdminRepository`, `Clock`, `Scheduler`, `CodeGenerator`, `Notifier`) + doubles de teste (`FakeClock`, `FakeScheduler`, `SpyNotifier`, `StubCodeGenerator`) | `ports/`, `test/doubles/` |
| B2 | `InMemoryElectionRepository` e `InMemoryAdminRepository` com controle de versão (concorrência otimista) | `adapters/` |
| B3 | `config.ts`: leitura e validação de variáveis de ambiente com Zod, com defaults de dev e teste | `config.ts` |
| B4 | `buildApp(deps)` + `GET /api/health` + mapeamento `DomainError`/Zod → `ErrorDTO` e status HTTP | `app.ts`, `http/errors.ts` |
| B5 | `AuthService`: hash com bcryptjs, emissão e verificação de JWT (`jose`), seed do admin | `services/auth.ts` |
| B6 | `POST /admin/login`, `GET /admin/me`, plugin de autenticação por papel (admin/eleitor) | `http/auth-routes.ts` |
| B7 | `ElectionService` — esqueleto do fluxo padrão (§8.2): carregar → autorizar → comando → salvar → notificar, testado com o domínio real | `services/election.ts` |
| B8 | Rotas de eleição: criar, listar, obter, editar | `http/election-routes.ts` |
| B9 | Rotas de cargos e fila (`positions`, `queue`, `queue/suggestion`) | `http/position-routes.ts` |
| B10 | Rotas de candidatos e anexar candidato existente | `http/candidate-routes.ts` |
| B11 | Rotas de eleitores (gerar códigos, revogar) + `CryptoCodeGenerator` | `http/voter-admin-routes.ts` |
| B12 | Rotas do ciclo de votação: `open`, `next`, `rounds`, `close`, `runoff`, `release`, `defer`, `cancel`, `annul`, `undo`, `finish` | `http/round-routes.ts` |
| B13 | `VoterService` + rotas do eleitor: `POST /voter/session`, `GET /voter/state`, `POST /voter/votes` | `services/voter.ts`, `http/voter-routes.ts` |
| B14 | Scheduler real (`TimeoutScheduler`) + fechamento automático no prazo e "fechamento preguiçoso" (§8.3), testados com `FakeScheduler`/`FakeClock` | `adapters/timeout-scheduler.ts` |
| B15 | Gateway Socket.IO: autenticação no handshake, salas, `admin:watch`, `SocketNotifier`, com teste de integração usando um cliente real em porta efêmera | `realtime/` |
| B16 | Cenários de integração completos via HTTP (fluxo básico, 2º turno, candidatos insuficientes, desfazer) | `test/integration/` |
| B17 | `PgElectionRepository` + `PgAdminRepository` + migração idempotente, testados com `pg-mem` | `adapters/pg-*.ts` |
| B18 | `main.ts` (composição humilde), reagendamento das rodadas abertas no boot, `@fastify/static` servindo o front com fallback SPA | `main.ts` |
| B20 | Build de produção (`tsup`/`tsc`) e scripts `build`/`start` funcionando nos 3 SOs | — |
| B21 | Deploy: Render + Neon, variáveis, `deploy.yml` acionado após CI verde na `main` → **marco M2** | `.github/workflows/deploy.yml` |
| B23 | Revisão de *test smells* e cobertura do servidor, documentação da API (`docs/api.md` ou seção do README) | — |

No [todo-backend.md](todo-backend.md), algumas tarefas foram divididas para caberem num único prompt: S0.3 → S0.3a/b, B7 → B7a/b, B12 → B12a/b, B13 → B13a/b e B16 → B16a/b. A B16b (cenários avançados) fica para depois da B21, porque depende de A15–A20.

As antigas B19 (rate limit) e B22 (Codecov e badges) passaram para A (A25 e A26), para equilibrar a carga. Os números B19 e B22 ficam vagos de propósito, para as referências antigas não mudarem de sentido.

Na B12, se a lista de rotas ficar grande para um único PR, divida em B12a (`open`/`next`/`rounds`/`close`) e B12b (o resto).

---

## 5. Integrante C — Frontend + e2e

O front só conhece `packages/shared`. Até o M2, a API é simulada com MSW e o socket com um fake. Meta: cerca de 45 testes de componente e de unidade, cobertura ≥ 80% e os ≥ 5 e2e.

O setup do `apps/web` (antiga C1) foi para o Sprint 0 (S0.5). C começa pela C2, com o projeto já rodando.

| # | Tarefa | Entrega |
|---|---|---|
| C2 | Infra de teste: handlers MSW que implementam o contrato da §6 com estado em memória, `renderWithProviders`, fábricas de DTO | `test/msw/`, `test/utils/` |
| C3 | `api-client.ts`: fetch tipado, token, tratamento de `ErrorDTO` | `src/api/` |
| C4 | `socket-client.ts` + `SocketProvider` injetável + `createFakeSocket()` para testes | `src/api/`, `test/` |
| C5 | Funções puras de `lib/`: contagem regressiva com correção por `serverNow`, porcentagens, rótulos de desempate | `src/lib/` |
| C6 | Componentes base: `ConfirmDialog`, `DoubleConfirmDialog` (2º passo exige digitar o nome do cargo), `Countdown`, `ErrorMessage` | `src/components/` |
| C7 | Eleitor: tela de entrada por código (`/`) com erros de código inválido ou revogado | `features/voter/` |
| C8 | Eleitor: `useVoterSession` + tela `/votar` com as fases `WAITING` e `VOTING` (cédula + voto branco) | `features/voter/` |
| C9 | Eleitor: fases `VOTED`, `RESULTS` e `FINISHED` + reconexão (busca `GET /voter/state` ao reconectar) | `features/voter/` |
| C10 | Admin: login, armazenamento do token, rotas protegidas | `features/admin/auth/` |
| C11 | Admin: lista e criação de eleições | `features/admin/elections/` |
| C12 | Admin, configuração: aba Cargos (criar, editar, remover, regra de desempate) | `features/admin/config/` |
| C13 | Admin, configuração: aba Candidatos (cargos marcados + primeira opção) | `features/admin/config/` |
| C14 | Admin, configuração: aba Eleitores (gerar N códigos, listar, copiar, revogar) e aba Ordem (↑↓ + "Sugerir ordem" com confirmação) | `features/admin/config/` |
| C15 | Admin ao vivo: `useAdminElection` (estado via socket), próximo cargo, abrir rodada, progresso x/y, prazo, fechar antes | `features/admin/live/` |
| C16 | Admin ao vivo: resultado, 2º turno, liberar resultado, desfazer, anular; painel de candidatos insuficientes (anexar, criar, adiar, cancelar com dupla confirmação) | `features/admin/live/` |
| C17 | Playwright: config com `webServer` (servidor real com `REPOSITORY=memory`), fixtures de API (admin logado, eleição pronta, códigos) | `e2e/` |
| C18 | E2E 1: admin configura uma eleição do zero pela UI e a abre | `e2e/specs/` |
| C19 | E2E 2: fluxo completo de um cargo com 3 eleitores em contextos separados | `e2e/specs/` |
| C20 | E2E 3: 2º turno | `e2e/specs/` |
| C21 | E2E 4: eleito excluído do cargo seguinte + cargo sem candidatos (adiar/cancelar) | `e2e/specs/` |
| C22 | E2E 5: desfazer passo + código inválido; e2e no CI dos 3 SOs (passo no `ci.yml`, combinado com B) | `e2e/specs/` |
| C23 | Acessibilidade e polimento: labels e roles, mensagens claras, layout para celular (eleitor vota pelo celular) | — |
| C24 | Revisão de *test smells* no front e nos e2e (sem `waitForTimeout`, seletores por role) | — |

C17 a C22 dependem do M2. Se o M2 atrasar, C pode adiantar C23 e C24, ou escrever os e2e apontando para o servidor com o domínio ainda parcial e terminar quando ele ficar pronto.

---

## 6. Tarefas do grupo (no fim)

| # | Tarefa | Responsável sugerido |
|---|---|---|
| G1 | README final: Integrantes, Sobre o sistema, Tecnologias, **Uso de IA** (cada um descreve como usou o agente, o CLAUDE.md, o hook e o TO-DO), Execução dos testes | Todos (cada um escreve sua parte); B consolida |
| G2 | Revisão cruzada: cada integrante revisa um PR de cada colega | Todos |
| G3 | Teste de aceitação manual em produção (uma eleição real com o grupo pelo celular) | Todos |
| G4 | Vídeo de até 5 min: sistema (C), tecnologias e CI/CD (B), uso de IA e testes (A) | Todos |
| G5 | Coletar os 5 links da entrega (produção, repo, run do Actions, Codecov, YouTube) | B |

---

## 7. Conferência das metas do enunciado

| Meta | Como a divisão garante |
|---|---|
| ≥ 50 testes de unidade | A cerca de 80 + B cerca de 30 de unidade + C cerca de 45 → bem acima de 50, mesmo que alguém atrase |
| ≥ 5 e2e | C18–C22 |
| Cobertura ≥ 80% | Limite em cada workspace (S0.2) + Codecov (A26) |
| CI nos 3 SOs | S0.6 desde o primeiro dia; e2e entram em C22 |
| Codecov | S0.6 (upload) / A26 (configuração e badges) |
| ≥ 50 commits | A 26 + B 32 (7 do Sprint 0 + 25 do servidor, contando as divisões a/b) + C 23 = cerca de 81 commits de tarefa, mais os do grupo |
| Deploy | B21 |
