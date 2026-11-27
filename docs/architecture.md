# Voto — Arquitetura e Stack

Este documento é a referência técnica do projeto. Ele define a stack, a arquitetura, os contratos entre módulos (tipos, API REST e eventos em tempo real) e a estratégia de testes. Os três integrantes, e os agentes de IA de cada um, devem segui-lo para que cada parte avance sem depender do ritmo das outras.

> Regra de ouro: **contratos primeiro**. Os tipos em `packages/shared` e as tabelas das seções 6 e 7 são a fronteira entre as partes. Mudar um contrato exige um commit próprio (`feat(shared): ...`) e aviso ao grupo.

---

## 1. Requisitos que guiam as decisões

| Origem | Requisito | Consequência na arquitetura |
|---|---|---|
| Enunciado | ≥ 50 testes de unidade, boas práticas | Regras de eleição num núcleo de domínio **puro**, sem I/O, fácil de testar |
| Enunciado | ≥ 5 testes e2e (Playwright/Cypress/Selenium) | Playwright, com vários contextos de navegador (admin + eleitores) |
| Enunciado | Cobertura ≥ 80% | Vitest + `@vitest/coverage-v8`, limite configurado para falhar o build |
| Enunciado | CI em Linux, macOS e Windows | Só dependências em JS puro (sem módulos nativos) e scripts multiplataforma |
| Enunciado | Codecov via GitHub Actions | Relatórios `lcov` por pacote, enviados com *flags* |
| Enunciado | Deploy em nuvem gratuita | Um único serviço Node (API + WebSocket + front estático) no Render; Postgres no Neon |
| README | Votação estilo Kahoot, com prazo | Tempo real via Socket.IO; prazo guardado como instante absoluto |
| README | Desempate, 2º turno, eleito sai dos próximos cargos | Funções puras de apuração e elegibilidade no domínio |
| README | Candidatos insuficientes, adiar ou cancelar cargo | Máquina de estados explícita para cargo e eleição |
| README | Algoritmo de ordenação dos cargos | Função pura e determinística no domínio |
| README | Resiliência: admin pode refazer passos | Agregado imutável + histórico de *snapshots* (desfazer) |

---

## 2. Stack

Tudo em **TypeScript**, num monorepo com **npm workspaces**. Use a última versão estável de cada ferramenta no momento do setup e fixe as versões pelo `package-lock.json`.

| Camada | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js 24 LTS | LTS ativa; mesma versão no CI e no deploy (`.nvmrc` + `engines`) |
| Linguagem | TypeScript (`strict: true`) | Contratos tipados entre as três partes |
| Domínio | TS puro, sem dependências de runtime | Testável, rápido e determinístico (FIRST) |
| Validação | Zod | Os mesmos schemas validam no servidor e tipam o cliente |
| Servidor HTTP | Fastify 5 | `app.inject()` permite testar rotas sem abrir porta |
| Tempo real | Socket.IO 4 (servidor e cliente) | Salas, reconexão automática e fallback de transporte |
| Autenticação | `bcryptjs` (hash da senha do admin) + `jose` (JWT) | JS puro, sem compilação nativa no Windows/macOS |
| Persistência (prod) | PostgreSQL no Neon (plano gratuito) via `pg` | O Render gratuito tem disco efêmero, então o estado precisa ficar fora |
| Persistência (dev/teste) | Repositório em memória + `pg-mem` | Testa o adaptador SQL em qualquer SO, sem Docker |
| Frontend | React 19 + Vite + React Router | Padrão de mercado; Vite já integra com Vitest |
| Testes de unidade/integração | Vitest | Um runner para domínio, servidor e web |
| Testes de componente | React Testing Library + `@testing-library/user-event` + `jsdom` | Testa pelo comportamento visível, não pela implementação |
| Mock de rede (front) | MSW (Mock Service Worker) | O front avança sem o backend pronto |
| E2E | Playwright (Chromium) | Vários contextos isolados (admin + N eleitores) no mesmo teste; roda nos 3 SOs |
| Cobertura | `@vitest/coverage-v8` → `lcov` | Formato aceito pelo Codecov |
| Qualidade | ESLint (flat config) + Prettier + `tsc --noEmit` | Rodam no CI antes dos testes |
| Teste de mutação (opcional) | StrykerJS no `packages/domain` | Aplica o conteúdo da aula 15 e mede a força dos testes |
| CI/CD | GitHub Actions + Codecov Action + Deploy Hook do Render | Exigido pelo enunciado |
| Deploy | Render (Web Service gratuito, suporta WebSocket) | Um único processo, uma única URL, sem CORS |

**Restrições para funcionar em Windows/macOS/Linux:**
- nada de dependência nativa (`bcrypt`, `better-sqlite3`, `sharp` etc.);
- scripts npm sem sintaxe de shell (`&&` funciona; `rm -rf`, `export VAR=` e `$VAR` não). Use `rimraf`, `cross-env` e `node:path`;
- nada de caminhos com `/` fixos em código de produção. Use `path.join`.

---

## 3. Visão geral da arquitetura

Arquitetura em camadas, no estilo hexagonal (portas e adaptadores). As regras de negócio ficam no centro e não conhecem HTTP, banco ou relógio. Isso aplica o padrão **Humble Object** da aula de testabilidade: as partes difíceis de testar (socket, banco, timers, UI) ficam "humildes", e a lógica fica em código puro.

```
                      ┌────────────────────────── apps/web (React) ──────────────────────────┐
  Navegador           │  páginas (humildes) → hooks/estado → api-client (fetch) + socket-client│
  (admin / eleitor)   └───────────────▲──────────────────────────────────────▲────────────────┘
                                      │ REST /api/*                          │ Socket.IO
                      ┌───────────────┴──────────── apps/server ────────────┴────────────────┐
                      │  Adaptadores de entrada:  rotas Fastify  |  gateway Socket.IO        │
                      │                     │                          ▲                     │
                      │                     ▼                          │ (porta Notifier)    │
                      │  Aplicação:   ElectionService / AuthService / VoterService           │
                      │               (orquestra: carrega → aplica comando → salva → notifica)│
                      │                     │           │            │                       │
                      │  Portas:   ElectionRepository  Clock  Scheduler  CodeGenerator  Notifier│
                      │  Adaptadores de saída: InMemoryRepo | PgRepo | SystemClock | ...     │
                      └─────────────────────┼────────────────────────────────────────────────┘
                                            ▼  funções puras
                      ┌──────────────── packages/domain ─────────────────┐
                      │ agregado Election, comandos, apuração, desempate, │
                      │ 2º turno, elegibilidade, ordenação, undo          │
                      └───────────────────────▲───────────────────────────┘
                                              │ tipos/schemas
                      ┌──────────────── packages/shared ──────────────────┐
                      │ DTOs, schemas Zod da API, nomes de eventos socket │
                      └───────────────────────────────────────────────────┘
```

Dependências permitidas (setas = "importa"):

- `apps/web` → `packages/shared`. **O front não importa o domínio.** Ele recebe tudo pronto do servidor.
- `apps/server` → `packages/domain`, `packages/shared`
- `packages/domain` → `packages/shared` (apenas tipos)
- `packages/shared` → nada (só `zod`)

Uma regra de ESLint (`no-restricted-imports`) faz o lint falhar se essa direção for violada.

---

## 4. Estrutura do repositório

```
voto/
├── package.json                 # workspaces + scripts raiz (test, coverage, e2e, lint, dev, build)
├── tsconfig.base.json
├── eslint.config.js
├── .nvmrc                       # 24
├── codecov.yml                  # flags e meta de 80%
├── CLAUDE.md                    # regras para os agentes (TDD etc.)
├── README.md                    # seções exigidas pelo enunciado
├── docs/
│   ├── architecture.md          # este arquivo
│   └── todo-<integrante>.md     # TO-DO de cada integrante para o agente
├── packages/
│   ├── shared/                  # contratos (DTOs, schemas Zod, eventos)
│   │   └── src/{dto.ts, api-schemas.ts, socket-events.ts, index.ts}
│   └── domain/                  # regras de negócio puras
│       ├── src/
│       │   ├── election/        # agregado, estados, comandos
│       │   ├── tally/           # apuração, maioria, 2º turno
│       │   ├── tiebreak/        # estratégias de desempate
│       │   ├── eligibility/     # quem pode concorrer a cada cargo
│       │   ├── ordering/        # algoritmo de prioridade dos cargos
│       │   ├── history/         # snapshots / desfazer
│       │   ├── errors.ts        # DomainError com códigos
│       │   └── index.ts         # ÚNICA API pública do pacote
│       └── test/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── app.ts           # buildApp(deps) → instância Fastify (injeção de dependências)
│   │   │   ├── main.ts          # composição real (humilde): lê env, cria adaptadores, sobe servidor
│   │   │   ├── config.ts
│   │   │   ├── ports/           # interfaces: Repository, Clock, Scheduler, CodeGenerator, Notifier
│   │   │   ├── adapters/        # in-memory-repo, pg-repo, system-clock, timeout-scheduler, socket-notifier
│   │   │   ├── services/        # ElectionService, AuthService, VoterService
│   │   │   ├── http/            # rotas, plugin de auth, mapeamento DomainError → status HTTP
│   │   │   └── realtime/        # gateway Socket.IO (salas, autenticação no handshake)
│   │   └── test/
│   │       ├── doubles/         # FakeClock, FakeScheduler, SpyNotifier, StubCodeGenerator
│   │       ├── unit/
│   │       └── integration/     # rotas via app.inject(), socket via cliente real em porta efêmera
│   └── web/
│       ├── src/
│       │   ├── api/             # api-client.ts, socket-client.ts (únicos pontos de I/O)
│       │   ├── features/admin/  # login, configuração, painel ao vivo
│       │   ├── features/voter/  # entrada por código, espera, cédula, resultado
│       │   ├── components/      # UI reutilizável (ConfirmDialog, Countdown, ...)
│       │   └── lib/             # lógica pura do front (formatação, contagem regressiva)
│       └── test/
│           ├── msw/             # handlers que implementam o contrato da seção 6
│           └── ...
├── e2e/
│   ├── playwright.config.ts     # webServer sobe o servidor com repositório em memória
│   ├── fixtures/                # login de admin, criação de eleitores via API
│   └── specs/
└── .github/workflows/
    ├── ci.yml                   # lint + typecheck + unit/coverage + e2e, matriz 3 SOs
    └── deploy.yml               # após CI verde na main → Deploy Hook do Render
```

Cada pasta de primeiro nível em `packages/` e `apps/`, mais `e2e/`, tem um dono principal. Isso reduz conflitos de merge (ver seção 11).

---

## 5. Modelo de domínio

### 5.1 Tipos centrais (`packages/shared/src/dto.ts` define as formas; `packages/domain` define o comportamento)

```ts
type TiebreakRule = 'YOUNGEST' | 'OLDEST' | 'MOST_REMAINING_TIME';

type ElectionStatus = 'DRAFT' | 'OPEN' | 'FINISHED';

type PositionStatus =
  | 'PENDING'          // aguardando na fila
  | 'VOTING'           // há uma rodada aberta para ele
  | 'AWAITING_RUNOFF'  // 1º turno sem maioria; admin pode abrir o 2º turno
  | 'DECIDED'          // tem eleito
  | 'CANCELLED';       // cancelado pelo admin (com dupla confirmação)

interface Election {
  id: string;
  adminId: string;
  name: string;
  status: ElectionStatus;
  defaultVotingSeconds: number;      // prazo padrão de cada rodada
  positions: Position[];
  queue: string[];                   // ids de cargos PENDING, na ordem de votação
  candidates: Candidate[];
  voters: Voter[];
  rounds: Round[];
  version: number;                   // controle otimista de concorrência
}

interface Position {
  id: string;
  title: string;
  tiebreak: TiebreakRule;
  status: PositionStatus;
  electedCandidateId?: string;
}

interface Candidate {
  id: string;
  name: string;
  age: number;                       // anos completos
  remainingMonths: number;           // tempo restante na universidade
  applications: string[];            // ids de cargos a que concorre
  firstChoicePositionId: string;     // precisa estar em applications
  createdAt: string;                 // ISO; usado como último critério de desempate
}

interface Voter {
  id: string;
  label?: string;                    // ex.: "Mesa 3"; opcional
  code: string;                      // código único por eleição, gerado aleatoriamente
  status: 'CREDENTIALED' | 'REVOKED';
}

interface Round {
  id: string;
  positionId: string;
  kind: 'FIRST' | 'RUNOFF';
  candidateIds: string[];            // cédula congelada na abertura
  eligibleVoterIds: string[];        // eleitores credenciados no momento da abertura
  votedVoterIds: string[];           // QUEM votou (para impedir voto duplo)...
  tally: Record<string, number>;     // ...separado de EM QUEM (sigilo do voto); chave 'BLANK' para branco
  openedAt: string;
  deadline: string;                  // instante absoluto (ISO)
  status: 'OPEN' | 'CLOSED' | 'ANNULLED';
  resultsReleased: boolean;
}
```

Decisões importantes:

- **Sigilo:** a rodada guarda *quem votou* separado da *contagem*. Não existe registro que ligue eleitor a candidato.
- **Cédula congelada:** na abertura, a rodada copia a lista de candidatos e de eleitores aptos. Mudanças posteriores não afetam uma rodada em andamento.
- **Prazo absoluto:** o `deadline` é um instante, não um contador. Se o servidor reiniciar (o Render gratuito hiberna), o fechamento continua correto (ver 8.3).

### 5.2 Estilo de implementação do domínio

> **Atualização (2026-11-23):** o domínio já foi implementado. Algumas assinaturas mudaram em relação à lista abaixo (ex.: `openRound` e `castVote` recebem um objeto; `createElection` devolve `Result`). A referência exata é `packages/domain/src/index.ts`, e as mudanças estão em `docs/todo-domain.md`, seção "Decisões e desvios".

O agregado é **imutável**. Cada operação é uma função pura:

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

interface DomainContext { now: Date; newId: () => string; }

// exemplos da API pública de packages/domain
createElection(input, ctx): Election
addPosition(election, input, ctx): Result<Election>
addCandidate(election, input, ctx): Result<Election>
credentialVoters(election, count, codeGen, ctx): Result<{ election: Election; codes: string[] }>
openElection(election): Result<Election>
nextPositionStatus(election): NextPositionInfo        // ok | INSUFFICIENT_CANDIDATES | NONE_LEFT
openRound(election, positionId, durationSec, ctx): Result<Election>
castVote(election, roundId, voterId, choice, ctx): Result<Election>
closeRoundIfDue(election, ctx): Election               // fecha se o prazo acabou ou todos votaram
closeRound(election, roundId, ctx): Result<Election>    // fechamento manual antecipado
computeResult(round, position, candidates): RoundResult // puro, só leitura
openRunoff(election, positionId, durationSec, ctx): Result<Election>
releaseResults(election, roundId): Result<Election>
deferPosition(election, positionId): Result<Election>
cancelPosition(election, positionId): Result<Election>
attachExistingCandidate(election, positionId, candidateId): Result<Election>
suggestOrder(election): string[]                        // algoritmo de prioridade
applyOrder(election, positionIds): Result<Election>
```

- Nada de `Date.now()`, `Math.random()` ou `crypto` dentro do domínio. Tempo, ids e códigos chegam por `ctx` ou por parâmetros, o que mantém os testes repetíveis (o R de FIRST).
- Erros esperados são **valores** (`Result`) com `DomainError.code` estável, por exemplo `CANDIDATE_ALREADY_ELECTED`, `ROUND_NOT_OPEN`, `VOTER_ALREADY_VOTED`, `INVALID_FIRST_CHOICE`. O servidor traduz esses códigos para HTTP (seção 6.3). `throw` fica reservado para bugs.
- `index.ts` é a única porta de entrada. Os testes importam do `index.ts`, o que garante que sejam feitos pela API pública.

### 5.3 Máquinas de estado

**Eleição:** `DRAFT --openElection--> OPEN --finishElection--> FINISHED`
- Em `DRAFT`: configura cargos, candidatos e eleitores livremente.
- Em `OPEN`: eleitores entram com o código. Ainda é possível adicionar candidatos e eleitores e reordenar a fila (o README exige isso nos casos de candidatos insuficientes).

**Cargo:**
```
PENDING ──openRound(FIRST)──> VOTING ──fechar──┬─> DECIDED          (há vencedor)
   ▲  │                                       └─> AWAITING_RUNOFF  (>2 candidatos e ninguém >50%)
   │  │                                                │ openRunoff
   │  │                                                ▼
   │  │                                             VOTING ──fechar──> DECIDED
   │  ├──deferPosition──> PENDING (vai para o fim da fila)
   │  └──cancelPosition──> CANCELLED
   └──────────── undo (histórico) volta a qualquer estado anterior ────────────
```

**Rodada:** `OPEN → CLOSED` (prazo esgotado, todos os aptos votaram ou fechamento manual). Pode virar `ANNULLED` por ação de resiliência do admin.

### 5.4 Regras de negócio (especificação para TDD)

**Elegibilidade (`eligibility/`)**
1. Um candidato está apto a um cargo se concorre a ele (`applications`) e **não foi eleito para nenhum cargo**.
2. `firstChoicePositionId` precisa estar em `applications`; senão, erro `INVALID_FIRST_CHOICE`.
3. Ao abrir uma rodada, a cédula traz só os candidatos aptos naquele momento.
4. `attachExistingCandidate` só aceita candidato não eleito. Ele inclui o cargo em `applications` do candidato.

**Apuração (`tally/`)**
1. Votos válidos são os votos em candidatos. Branco (`'BLANK'`) conta como comparecimento, mas não como válido.
2. Com **mais de 2 candidatos**: se alguém tem **mais de 50% dos válidos**, é eleito. Senão, o cargo vai para `AWAITING_RUNOFF` com os dois mais votados.
3. Com **1 ou 2 candidatos**: vence o mais votado. Empate é resolvido pelo desempate do cargo (sem 2º turno).
4. **Corte para o 2º turno com empate:** se houver empate na fronteira (por exemplo, três candidatos empatados em 1º, ou um em 1º e dois empatados em 2º), aplica-se o desempate do cargo só entre os empatados, até sobrarem exatamente 2 finalistas.
5. **2º turno:** vence o mais votado; empate é resolvido pelo desempate do cargo.
6. Zero votos válidos: o resultado é `NO_VALID_VOTES` e o cargo volta para `PENDING`, no início da fila. O admin decide se repete a votação, adia ou cancela.

**Desempate (`tiebreak/`):** padrão *Strategy*, um comparador por regra.
- `YOUNGEST`: menor `age` vence. `OLDEST`: maior `age` vence. `MOST_REMAINING_TIME`: maior `remainingMonths` vence.
- Se a regra ainda empatar, vence o `createdAt` mais antigo. Isso garante que o resultado seja sempre determinístico.

**Votação (`election/`)**
1. Só vota quem está em `eligibleVoterIds` da rodada e com status `CREDENTIALED`.
2. Um voto por eleitor por rodada (`VOTER_ALREADY_VOTED`).
3. Voto após o `deadline` é rejeitado (`ROUND_EXPIRED`), mesmo que a rodada ainda não tenha sido fechada formalmente.
4. A rodada fecha automaticamente quando `votedVoterIds` cobre todos os `eligibleVoterIds`.
5. Só pode haver **uma rodada aberta por vez** na eleição.
6. Ao ser declarado eleito, o candidato fica inapto para todos os cargos seguintes.
7. Resultados ficam visíveis ao admin assim que a rodada fecha. Aos eleitores, só depois de `releaseResults`.

**Candidatos insuficientes**
- `nextPositionStatus` diz se o cargo no topo da fila tem 0 aptos (`INSUFFICIENT_CANDIDATES`), junto com a lista de candidatos existentes não eleitos que podem ser anexados.
- Ações disponíveis nesse caso: anexar candidato existente, criar candidato novo, adiar (`deferPosition`) ou cancelar (`cancelPosition`).
- A "dupla confirmação inconveniente" é uma regra de **UI**: dois diálogos, e o segundo exige digitar o nome do cargo. O backend reforça isso exigindo `confirmTitle` igual ao título do cargo.

**Algoritmo de ordenação (`ordering/`)**

Função pura `suggestOrder(election)` que ordena os cargos `PENDING` por uma pontuação. A ordenação é estável e desempata pela ordem atual da fila.
1. **Conflitos:** para cada cargo, quantos de seus candidatos aptos também concorrem a outros cargos pendentes (maior primeiro).
2. **Disputa:** número de candidatos aptos (maior primeiro). Cargos com 0 ou 1 apto vão para o fim.
3. **Primeira opção:** número de candidatos que marcaram o cargo como primeira opção (maior primeiro).

Ideia: resolver cedo os cargos que, ao eleger alguém, mais "liberam" ou "bloqueiam" outros cargos. O admin vê a ordem sugerida e confirma (`applyOrder`). A ordem nunca é aplicada sem confirmação.

**Resiliência / desfazer (`history/`)**
- O serviço guarda uma pilha de snapshots do agregado (limite de 50) a cada comando que muda estado.
- `undo` restaura o snapshot anterior. Exemplos: reabrir um cargo decidido por engano, desfazer um cancelamento, desfazer a liberação de resultados.
- Também existe `annulRound(roundId)`, que anula uma rodada específica e devolve o cargo a `PENDING` no início da fila.
- O domínio expõe `pushSnapshot`, `undo` e `history` como funções puras sobre `{ current, past[] }`.

### 5.5 Decisões tomadas sobre ambiguidades do README

| Ambiguidade | Decisão adotada (pode ser revista pelo grupo) |
|---|---|
| "Tempo restante de permanência" favorece mais ou menos tempo? | Favorece **mais** tempo restante (pode cumprir o mandato) |
| Voto branco conta para os 50%? | Não; os 50% são sobre os **votos válidos**, como diz o README |
| 2º turno é automático? | Não; fica **disponível ao admin**, que o abre (como diz o README) |
| Cargo com 1 candidato | Há votação; vence se tiver ≥ 1 voto válido, senão `NO_VALID_VOTES` |
| "Credenciar eleitor" | Admin gera N códigos (opcionalmente com rótulo); pode revogar um código |
| Formato do código | 8 caracteres do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem caracteres ambíguos), via `crypto.randomInt`, **único em todo o sistema** (o eleitor entra só com o código) |
| Vários admins? | Sim, cada admin vê só as próprias eleições; o primeiro admin é criado por seed (env) |

---

## 6. Contrato da API REST

Base: `/api`. JSON. Autenticação por `Authorization: Bearer <jwt>`. O token de admin tem `role=admin` e validade de 12h. O token de eleitor tem `role=voter`, `electionId` e `voterId`, com validade de 7 dias; se a eleição dele não existir mais, é recusado com `401 INVALID_TOKEN`. Todos os corpos são validados com os schemas Zod de `packages/shared/src/api-schemas.ts`. Um POST com `Content-Type: application/json` e corpo vazio vale como corpo ausente (o front manda esse cabeçalho em todo POST); quem exige corpo o recusa pelo Zod.

A referência com exemplos de requisição e resposta está em [api.md](api.md).

### 6.1 Admin

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/admin/login` | `{ username, password }` | `200 { token }` / `401` / `429 RATE_LIMITED` |
| GET | `/admin/me` | — | `{ id, username }` |
| GET | `/elections` | — | `ElectionSummaryDTO[]`, na ordem de criação |
| POST | `/elections` | `{ name, defaultVotingSeconds? }` | `201 AdminElectionDTO` |
| GET | `/elections/:id` | — | `AdminElectionDTO` |
| PATCH | `/elections/:id` | `{ name?, defaultVotingSeconds? }` | `AdminElectionDTO` |
| POST | `/elections/:id/positions` | `{ title, tiebreak }` | `201 AdminElectionDTO` |
| PATCH | `/elections/:id/positions/:pid` | `{ title?, tiebreak? }` | `AdminElectionDTO` |
| DELETE | `/elections/:id/positions/:pid` | — | `AdminElectionDTO` (só em `DRAFT`) |
| PUT | `/elections/:id/queue` | `{ positionIds }` | `AdminElectionDTO` |
| GET | `/elections/:id/queue/suggestion` | — | `{ positionIds }` |
| POST | `/elections/:id/candidates` | `{ name, age, remainingMonths, applications: string[], firstChoicePositionId }` | `201 AdminElectionDTO` |
| PATCH / DELETE | `/elections/:id/candidates/:cid` | parcial / — | `AdminElectionDTO` |
| POST | `/elections/:id/positions/:pid/candidates/:cid` | — | anexa candidato existente → `AdminElectionDTO` |
| POST | `/elections/:id/voters` | `{ count, labels? }` | `201 { codes: string[], election: AdminElectionDTO }` |
| DELETE | `/elections/:id/voters/:vid` | — | revoga → `AdminElectionDTO` |
| POST | `/elections/:id/open` | — | `AdminElectionDTO` |
| GET | `/elections/:id/next` | — | `NextPositionDTO` |
| POST | `/elections/:id/positions/:pid/defer` | — | `AdminElectionDTO` |
| POST | `/elections/:id/positions/:pid/cancel` | `{ confirmTitle }` | `AdminElectionDTO` |
| POST | `/elections/:id/rounds` | `{ positionId, durationSeconds? }` | `201 AdminElectionDTO` |
| POST | `/elections/:id/rounds/:rid/close` | — | `AdminElectionDTO` |
| POST | `/elections/:id/positions/:pid/runoff` | `{ durationSeconds? }` (corpo opcional) | `201 AdminElectionDTO` |
| POST | `/elections/:id/rounds/:rid/release` | — | `AdminElectionDTO` |
| POST | `/elections/:id/rounds/:rid/annul` | — | `AdminElectionDTO` |
| POST | `/elections/:id/undo` | — | `AdminElectionDTO` / `409 NOTHING_TO_UNDO` |
| POST | `/elections/:id/finish` | — | `AdminElectionDTO` |

Quase toda mutação devolve o `AdminElectionDTO` completo. Assim, o front tem **um único formato de estado** para renderizar.

### 6.2 Eleitor e público

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/health` | — | `{ status: 'ok' }` |
| POST | `/voter/session` | `{ code }` | `200 { token, electionId, electionName }` / `404 INVALID_CODE` / `403 VOTER_REVOKED` / `429 RATE_LIMITED` |
| GET | `/voter/state` | — | `VoterStateDTO` |
| POST | `/voter/votes` | `{ roundId, choice }` (`choice` = id do candidato ou `'BLANK'`) | `204` / `409 VOTER_ALREADY_VOTED` / `410 ROUND_EXPIRED` / `404 ROUND_NOT_FOUND` |

### 6.3 DTOs principais e erros

```ts
interface AdminElectionDTO {
  election: Election;                         // agregado completo (seção 5.1)
  currentRound?: RoundView & { votedCount: number; eligibleCount: number };
  lastResult?: RoundResultDTO;                // resultado da última rodada fechada
  next: NextPositionDTO;
  canUndo: boolean;
  serverNow: string;                          // para sincronizar o relógio do cliente
}

type VoterStateDTO =
  | { phase: 'WAITING'; electionName: string; serverNow: string }
  | { phase: 'VOTING'; round: RoundView; serverNow: string }   // RoundView: cargo, candidatos (nome), deadline
  | { phase: 'VOTED'; roundId: string; serverNow: string }
  | { phase: 'RESULTS'; result: RoundResultDTO; serverNow: string }
  | { phase: 'FINISHED'; serverNow: string };

interface RoundResultDTO {
  roundId: string; positionTitle: string; kind: 'FIRST' | 'RUNOFF';
  counts: { candidateId: string; name: string; votes: number }[];
  blank: number; validVotes: number;
  outcome: 'ELECTED' | 'RUNOFF_REQUIRED' | 'NO_VALID_VOTES';
  electedCandidateId?: string; runoffCandidateIds?: [string, string];
  tiebreakApplied: boolean;
}

interface NextPositionDTO {
  status: 'READY' | 'INSUFFICIENT_CANDIDATES' | 'NONE_LEFT' | 'ROUND_IN_PROGRESS' | 'AWAITING_RUNOFF';
  positionId?: string;
  attachableCandidates?: { id: string; name: string }[];
}

interface ElectionSummaryDTO {               // item da lista de eleições do admin
  id: string; name: string; status: ElectionStatus; positionCount: number; voterCount: number;
}

interface ErrorDTO { error: { code: ErrorCode; message: string } }   // ErrorCode: error-codes.ts
```

Mapeamento de erros (`apps/server/src/http/error-status.ts`): validação Zod ou JSON malformado → `400 VALIDATION_ERROR`; sem token, token inválido ou login errado → `401`; papel errado, eleição de outro admin ou eleitor revogado (`VOTER_REVOKED`) → `403`; recurso inexistente (`*_NOT_FOUND`) ou código de eleitor desconhecido (`INVALID_CODE`) → `404`; `DomainError` de estado inválido e `VERSION_CONFLICT` → `409`; `ROUND_EXPIRED` → `410`; excesso de tentativas → `429 RATE_LIMITED` com `Retry-After`; erro inesperado → `500 INTERNAL_ERROR`, sem a mensagem interna.

---

## 7. Contrato de tempo real (Socket.IO)

Princípio: **o servidor é a fonte da verdade e envia o estado inteiro**, não deltas. O cliente só substitui o estado local. Isso elimina a maior parte dos bugs de sincronização e deixa o contrato mínimo.

- Conexão: `io(URL, { auth: { token } })`. O servidor valida o JWT no handshake (token ausente ou inválido → `connect_error` com `INVALID_TOKEN`) e coloca o socket na sala certa:
  - admin → `admin:<electionId>` (depois de emitir `admin:watch { electionId }`, com verificação de dono; eleição alheia ou inexistente é ignorada sem derrubar a conexão)
  - eleitor → `voters:<electionId>` e `voter:<voterId>`

| Evento (servidor → cliente) | Sala | Payload | Quando |
|---|---|---|---|
| `admin:state` | `admin:<id>` | `AdminElectionDTO` | Depois de toda gravação: comandos do admin, cada voto, fechamento por prazo e desfazer |
| `voter:state` | `voter:<voterId>` | `VoterStateDTO` | Depois de toda gravação da eleição, um evento para cada eleitor credenciado (rodada aberta ou fechada, resultado liberado, voto, eleição encerrada) |

| Evento (cliente → servidor) | Payload | Efeito |
|---|---|---|
| `admin:watch` | `{ electionId }` | Entra na sala da eleição e recebe `admin:state` na hora |

Votar **não** passa pelo socket: usa `POST /voter/votes`, que é mais fácil de testar, validar e repetir. Ao reconectar, o cliente chama `GET /voter/state` ou `GET /elections/:id` para se ressincronizar.

Os nomes dos eventos ficam como constantes em `packages/shared/src/socket-events.ts`.

---

## 8. Backend em detalhe

### 8.1 Portas (interfaces) e implementações

| Porta | Produção | Testes |
|---|---|---|
| `ElectionRepository { get(id), create(record), save(record, expectedVersion), listByAdmin(adminId), listAll(), findByVoterCode(code), isCodeTaken(code) }` | `PgElectionRepository` (uma linha por eleição com o registro em `JSONB` + tabela `voter_codes`) | `InMemoryElectionRepository` (*Fake*); `pg-mem` para testar o adaptador SQL; os dois passam na mesma suíte de contrato |
| `AdminRepository { findByUsername, findById, create }` | `PgAdminRepository` | `InMemoryAdminRepository` (mesma suíte de contrato) |
| `Clock { now(): Date }` | `systemClock` | `FakeClock` (avança manualmente) |
| `Scheduler { schedule(at, key, fn), cancel(key) }` | `TimeoutScheduler` (`setTimeout`, prazos longos em etapas) | `FakeScheduler` (dispara sob comando) |
| `CodeGenerator` (do domínio) | `createCryptoCodeGenerator()` (`crypto.randomInt`) | `StubCodeGenerator` (sequência fixa) |
| `Notifier { adminState(id, dto), voterState(voterId, dto) }` | `SocketNotifier` | `SpyNotifier` (registra chamadas) |
| `Logger { error(context, message) }` | logger do Fastify | `SpyLogger` |

O repositório guarda um `ElectionRecord = History<Election>` (estado atual + snapshots do desfazer), para o desfazer sobreviver a reinícios. Os códigos de eleitor são únicos entre **todas** as eleições (o eleitor entra só com o código): o serviço confere ao gerar, e a chave primária de `voter_codes` garante. As listagens saem na ordem de criação (coluna `creation_order`), sem campo novo na `Election`. O servidor incrementa `election.version` ao salvar.

`buildApp(deps)` recebe todas as portas e não chama `listen`. O Socket.IO entra por `deps.realtime` (`createRealtimeServer()` e depois `attachRealtime(io, httpServer, deps)`), o que quebra o ciclo notificador → io → app. Os testes de integração montam o app com fakes; `createServer(config)` (`compose.ts`) monta com as implementações reais, e `main.ts` (humilde, sem lógica) só chama `loadConfig` → `createServer` → `listen`. Isso aplica, nessa ordem, os tipos de *test double* das aulas 17 e 18: Fake, Stub, Spy, Dummy.

### 8.2 Fluxo de um comando no `ElectionService`

```
0. fila em memória da eleição           → uma gravação de cada vez por eleição (votos, prazo, admin)
1. repo.get(id)                         → registro atual (eleição + histórico)
2. autorização (admin dono)
3. domínio: closeRoundIfDue(e, ctx)     → aplica prazos vencidos antes de tudo ("fechamento preguiçoso")
4. domínio: <comando>(e, input, ctx)    → Result
5. se erro → DomainError → HTTP 409 (ou o status da §6.3)
6. comando do admin: history.push(snapshot); voto e fechamento por prazo: sem snapshot
   repo.save(novo com version + 1, versãoEsperada)
7. scheduler: (re)agenda o fechamento no deadline da rodada aberta
8. notifier: admin:state + voter:state de cada eleitor credenciado
```

Detalhes que a implementação acrescentou:
- **Fila por eleição** (`KeyedQueue`): o prazo é julgado pela chegada do pedido, não pela vez na fila. Vale só para **uma instância** do servidor; com mais de uma, sobra apenas a conferência de versão.
- **`VERSION_CONFLICT`**: o voto é reaplicado sobre a eleição relida (até 50 tentativas); o fechamento por prazo relê e devolve o estado atual; um comando do admin devolve 409 na hora.
- **Desfazer**: o voto e o fechamento automático por prazo **não** são passos. Desfazer um passo do admin descarta os votos registrados depois dele; desfazer depois de um fechamento por prazo descarta a rodada inteira. O snapshot de um comando guarda a eleição já com o prazo vencido aplicado.

### 8.3 Prazo e reinício do servidor

- Ao abrir uma rodada, o `Scheduler` agenda o fechamento para `deadline + tolerância`.
- Se o processo reiniciar e perder o timer, o passo 3 do fluxo fecha a rodada na próxima leitura ou escrita. Na inicialização, o `buildApp` reagenda as rodadas abertas num gancho `onReady` (o `createServer` só chama `ready`).
- O servidor aceita voto até `deadline + 1s` de tolerância (`VOTE_GRACE_MS`), para compensar a latência de rede. O fechamento preguiçoso de leituras e comandos usa a mesma tolerância; só o timer, que já dispara nesse horário, julga sem desconto. O front mostra a contagem regressiva usando `serverNow` para corrigir a diferença de relógio.

### 8.4 Segurança básica

- A senha do admin é guardada como hash bcrypt. O seed lê `ADMIN_USERNAME`/`ADMIN_PASSWORD` do ambiente **só no primeiro boot**: se o usuário já existe, a senha guardada é mantida.
- `JWT_SECRET` vem do ambiente. É obrigatório em produção e sempre que `REPOSITORY=pg` (banco real = ambiente real); só a memória em dev e teste usa o valor fixo de desenvolvimento.
- Rate limit em `/voter/session` (60/min) e `/admin/login` (10/min), por rota e por IP, contra força bruta: hook próprio (`http/rate-limit.ts`) com a porta `Clock`, em vez do `@fastify/rate-limit`, para a janela ser testável com o `FakeClock` sem dependência nova. Desligável com `RATE_LIMIT=off` (os e2e sobem assim, pois todos os navegadores saem do mesmo IP). Atrás de proxy, o IP do cliente vem de `TRUST_PROXY_HOPS` (número de proxies confiáveis; 3 no Render, medido em produção).
- O código do eleitor só aparece na resposta da criação e na visão do admin. Ele nunca é enviado a outros eleitores.

---

## 9. Frontend em detalhe

**Rotas**

| Rota | Quem | Conteúdo |
|---|---|---|
| `/` | eleitor | Campo do código + "Entrar" |
| `/votar` | eleitor | Uma tela por `phase`: espera, cédula com contagem regressiva, "voto registrado", resultado, encerrado |
| `/admin/login` | admin | Formulário de login |
| `/admin` | admin | Lista e criação de eleições |
| `/admin/eleicoes/:id/configurar` | admin | Abas: Cargos · Candidatos · Eleitores (gerar e listar códigos) · Ordem (arrastar ou botões ↑↓ + "Sugerir ordem") |
| `/admin/eleicoes/:id/ao-vivo` | admin | Próximo cargo, abrir rodada, progresso (x/y votaram), prazo, resultado, 2º turno, liberar, desfazer, painel de candidatos insuficientes |

**Organização para testabilidade**
- Componentes de página são **humildes**: só renderizam props e chamam callbacks.
- A lógica fica em hooks (`useAdminElection`, `useVoterSession`) e em funções puras em `lib/`, como cálculo de tempo restante e formatação de porcentagens.
- `api/api-client.ts` e `api/socket-client.ts` são os únicos módulos com I/O. Nos testes, a rede é interceptada pelo MSW (REST) e o socket é trocado por um *fake* (`createFakeSocket()`), injetado por um Context Provider.
- Seletores acessíveis: use `getByRole` e `getByLabelText`. Os testes e2e também usam `getByRole`, então a acessibilidade é testada de graça. `data-testid` só quando não houver alternativa.
- Estilo: CSS Modules ou um CSS simples. Sem biblioteca de componentes pesada, para manter o bundle e os testes simples.

---

## 10. Estratégia de testes

### 10.1 Pirâmide e metas

| Nível | Onde | Ferramenta | Meta |
|---|---|---|---|
| Unidade (domínio) | `packages/domain/test` | Vitest | Muitos testes; cobertura ≥ 95% (é o núcleo) |
| Unidade (servidor) | `apps/server/test/unit` | Vitest + doubles | Serviços com Fake/Stub/Spy |
| Integração (servidor) | `apps/server/test/integration` | Vitest + `app.inject()` + cliente Socket.IO em porta efêmera + `pg-mem` | Contrato HTTP e socket |
| Componente (web) | `apps/web/test` | Vitest + RTL + MSW | Telas por comportamento |
| E2E | `e2e/specs` | Playwright | **Exatamente o necessário (≥ 5)**: e2e são lentos e tendem a ser instáveis (aula 9) |

O total de testes de unidade do grupo deve passar com folga dos 50 (meta: 150+). A cobertura combinada, medida pelo Codecov, deve ficar ≥ 80%, e o CI falha se algum pacote ficar abaixo de 80% em linhas, branches, funções ou statements.

**Exclusões de cobertura permitidas** (e só estas): `main.ts`, `*.d.ts`, arquivos de configuração e `apps/web/src/main.tsx`. São os "objetos humildes" de composição.

### 10.2 Cenários e2e planejados (mínimo 5)

1. Admin faz login, cria eleição, cargo e candidatos, gera códigos e abre a eleição.
2. Fluxo completo de um cargo: 3 eleitores (3 contextos de navegador) entram com código, admin abre a rodada, todos votam, a rodada fecha sozinha, admin vê o resultado e libera, eleitores veem o resultado.
3. 2º turno: 3 candidatos e votos divididos, admin abre o 2º turno com os 2 mais votados e um vencedor é eleito.
4. Exclusão do eleito: o candidato eleito no cargo A não aparece na cédula do cargo B. Cargo sem candidatos mostra as opções "anexar existente", "adiar" e "cancelar" (com dupla confirmação).
5. Resiliência: admin desfaz a liberação ou o resultado e o estado volta ao anterior. Código inválido na entrada mostra mensagem de erro.

Os e2e rodam contra o servidor real com `REPOSITORY=memory`. A preparação dos dados é feita via API (fixture), não pela UI, e cada teste cria a sua própria eleição. Assim, os testes ficam independentes e podem rodar em qualquer ordem. Para o cenário de prazo, use durações curtas (por exemplo 3s) e asserções com espera automática do Playwright (`expect(...).toBeVisible()`), **nunca** `waitForTimeout` fixo (*Sleepy Test*).

### 10.3 Convenções obrigatórias de teste (resumo; o `CLAUDE.md` detalha)

- **TDD:** escrever o teste que falha (vermelho), depois o mínimo para passar (verde), depois refatorar. A tarefa só termina com a suíte inteira verde.
- **Nomes** descrevem comportamento, em inglês (todo o código é em inglês; só comentários e commits são em português): `it('elects the candidate with more than 50% of valid votes')`, agrupados por `describe('computeResult')`.
- Estrutura **Arrange–Act–Assert**, um comportamento por teste e poucos `expect` por teste.
- Testar pela **API pública**: importar do `index.ts` do pacote, não de arquivos internos.
- **FIRST:** rápidos (nada de rede real nos testes de unidade), independentes (sem estado global; cada teste cria seus dados via *builders* como `anElection().withPosition(...).build()`), repetíveis (FakeClock, StubCodeGenerator), autoverificáveis e escritos junto com o código.
- *Test smells* proibidos: Assertion Roulette, Conditional Test Logic (sem `if`/`for` em teste), Magic Number sem nome, Mystery Guest, General Fixture, Sleepy Test, Ignored Test (`.skip` não entra na `main`), Redundant Print.
- Preferir *state verification* (verificar o resultado) a verificar chamadas. Mocks ou spies só nas fronteiras (Notifier, Scheduler).

---

## 11. Fronteiras pensadas para dividir o trabalho

A divisão detalhada está em [divisao-tarefas.md](divisao-tarefas.md). A arquitetura separa três áreas quase independentes, cada uma com seus próprios testes e sua própria cobertura:

| Área | Pastas | Depende de | Como trabalhar sem esperar os outros |
|---|---|---|---|
| **Domínio** (regras da eleição) | `packages/domain` | `packages/shared` (tipos) | Totalmente isolado: só funções puras e testes de unidade |
| **Backend + infra** (API, tempo real, persistência, CI/CD, deploy) | `apps/server`, `.github/`, `codecov.yml`, deploy | `packages/domain`, `packages/shared` | Programa contra a API pública do domínio (já implementada por A) e testa com o domínio real; as rotas seguem o contrato da seção 6 |
| **Frontend + e2e** | `apps/web`, `e2e/` | `packages/shared` | MSW implementa o contrato REST e um socket fake implementa a seção 7. Os e2e entram por último, quando servidor e domínio estiverem integrados |

**Sprint 0 (feito por uma pessoa antes da divisão, em poucos commits pequenos; a lista oficial, que também inclui o esqueleto do `apps/web`, está em [divisao-tarefas.md](divisao-tarefas.md)):**
1. Esqueleto do monorepo (workspaces, TS, ESLint, Prettier, Vitest em cada pacote, scripts raiz).
2. `packages/shared` com os DTOs, schemas e eventos das seções 5.1, 6 e 7.
3. `ci.yml` com a matriz de 3 SOs rodando lint, typecheck e testes (mesmo que ainda haja poucos), mais o upload no Codecov.
4. Assinaturas exportadas em `packages/domain/src/index.ts` que lançam `not implemented`. Isso deixa o servidor compilar desde o primeiro dia.

Depois disso, cada integrante trabalha numa *branch* `feat/<area>-<tarefa>` e abre PRs pequenos para a `main`. O CI precisa estar verde para fazer merge.

---

## 12. CI/CD

**`.github/workflows/ci.yml`** (em todo `push` e `pull_request`)

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
steps:
  - checkout
  - setup-node (node-version-file: .nvmrc, cache: npm)
  - npm ci
  - npm run lint && npm run format:check && npm run typecheck
  - npm run test:coverage            # vitest em cada workspace, com thresholds de 80%
  - codecov/codecov-action (apenas ubuntu; um upload por flag: shared, domain, server, web)
      with: token: ${{ secrets.CODECOV_TOKEN }}, files: packages/shared/coverage/lcov.info,...
  - npm run build
  - npm ci (working-directory: e2e)
  - npx playwright install --with-deps chromium (Ubuntu) / npx playwright install chromium (macOS, Windows)
  - npm run e2e
  - upload-artifact: relatório do Playwright em caso de falha
```

**`.github/workflows/deploy.yml`:** dispara em `workflow_run` do CI concluído com sucesso num `push` na `main` e chama o Deploy Hook do Render (`secrets.RENDER_DEPLOY_HOOK`) com `&ref=<sha>` do commit aprovado (e não o último da `main`). O auto-deploy do Render fica desligado, para que só código com CI verde vá para produção.

**`codecov.yml`:** `coverage.status.project.default.target: 80%` (e 80% no *patch*), com flags `shared`, `domain`, `server` e `web` (`carryforward`), e comentários em PR ativados.

**Convenção de commits:** [Conventional Commits](https://www.conventionalcommits.org/) em português, com escopo:
`feat(domain): implementa desempate por idade`, `test(server): cobre rota de abertura de rodada`, `ci: adiciona matriz de SOs`.
Padrão: **um commit por tarefa do TO-DO**, contendo os testes e a implementação, já com a suíte verde. O CI roda em todo commit, e commits vermelhos deixariam o histórico de builds poluído. O ciclo vermelho → verde acontece localmente, dentro da tarefa. Os PRs são integrados com *merge commit* (sem *squash*), para preservar os commits individuais e garantir a contagem mínima de 50.

---

## 13. Deploy

| Item | Escolha |
|---|---|
| Aplicação | Render, Web Service gratuito, Node 24, Blueprint em `render.yaml` (`numInstances: 1`, auto-deploy desligado). No ar em https://vota-ae.onrender.com |
| Build | `npm ci --include=dev && npm run build` (gera `apps/web/dist` e `apps/server/dist`). O `--include=dev` é necessário porque, com `NODE_ENV=production` também no build, o `npm ci` omitiria `vite`, `tsup` e `cross-env` |
| Start | `npm start` (define `WEB_DIST_DIR=apps/web/dist` e roda `node apps/server/dist/main.js`). O Fastify serve a API em `/api`, o Socket.IO e o front estático com `@fastify/static` e fallback para `index.html` (exceto caminhos com extensão de arquivo, que dão 404) |
| Banco | Neon Postgres gratuito (`DATABASE_URL`, conexão direta com `sslmode=verify-full`). A migração (tabelas `admins`, `elections` e `voter_codes`) roda no boot, de forma idempotente, só com `CREATE TABLE IF NOT EXISTS`: o esquema está congelado; uma mudança futura precisa de `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` com teste num banco do esquema anterior |
| Variáveis | `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NODE_ENV=production`, `REPOSITORY=pg`, `RATE_LIMIT=on`, `TRUST_PROXY_HOPS=3` |
| Limitações aceitas | O plano gratuito hiberna após inatividade (o 1º acesso demora). Funciona com **uma única instância**, já que as salas do Socket.IO e a fila de gravação por eleição ficam em memória. O estado persiste no Postgres e os prazos são recalculados no boot |

---

## 14. Scripts raiz esperados

| Script | Faz |
|---|---|
| `npm run dev` | Servidor (`tsup --watch`, que recompila e reinicia o `dist/main.js` a cada arquivo salvo, na porta 3000) + web (`vite`, porta 5173) em paralelo pelo `scripts/dev.mjs`, com proxy do Vite para `/api` e `/socket.io`. Ctrl+C encerra os dois. O admin só existe com `ADMIN_USERNAME`/`ADMIN_PASSWORD` no ambiente. |
| `npm test` | Vitest em todos os workspaces |
| `npm run test:coverage` | Igual ao anterior, com cobertura e thresholds |
| `npm run e2e` | Playwright (sobe o servidor sozinho via `webServer`) |
| `npm run lint` / `typecheck` / `format` / `format:check` | Qualidade |
| `npm run build` | Build de produção de `web` (Vite) e `server` (tsup, `dist/main.js`). `shared` e `domain` não têm build próprio: entram nos dois bundles |
| `npm start` | Sobe o build de produção servindo o front de `apps/web/dist` |
