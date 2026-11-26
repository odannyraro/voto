# Referência da API — Voto

Referência curta do que o servidor (`apps/server`) expõe hoje: rotas REST e eventos do Socket.IO. Os tipos citados (`AdminElectionDTO`, `VoterStateDTO`...) estão em `packages/shared/src/dto.ts`, os corpos de requisição em `packages/shared/src/api-schemas.ts` e os códigos de erro em `packages/shared/src/error-codes.ts`. O desenho por trás está no [architecture.md](architecture.md) (§6 REST, §7 tempo real, §8 backend).

Os exemplos vieram de um servidor local com `REPOSITORY=memory`. Os ids reais são UUIDs; aqui eles foram encurtados (`e-1`, `p-1`, `c-ana`, `r-1`) para facilitar a leitura.

## Convenções

- **Base:** `/api`. Corpo e resposta em JSON. Um POST sem corpo pode mandar `Content-Type: application/json` com o corpo vazio; ele vale como corpo ausente.
- **Autenticação:** `Authorization: Bearer <jwt>`.
  - Token de **admin**: vem do `POST /api/admin/login`, vale 12 h.
  - Token de **eleitor**: vem do `POST /api/voter/session`, vale 7 dias e carrega `electionId` e `voterId`.
- **Estado inteiro:** quase toda rota do admin devolve o `AdminElectionDTO` completo (eleição, rodada corrente, último resultado, próximo passo, `canUndo` e `serverNow`). O front só substitui o estado que tinha.
- **Prazo:** toda leitura ou escrita aplica antes o prazo vencido da rodada aberta ("fechamento preguiçoso"); um timer também fecha a rodada no prazo. O voto é aceito até 1 s depois do `deadline` (padrão; variável `VOTE_GRACE_MS`).
- **Erros:** sempre no formato `ErrorDTO`:

  ```json
  { "error": { "code": "VOTER_ALREADY_VOTED", "message": "This voter already voted" } }
  ```

| Status | Quando | Códigos |
|---|---|---|
| 400 | corpo inválido (Zod) ou JSON malformado | `VALIDATION_ERROR` |
| 401 | sem token, token inválido/vencido, login errado | `INVALID_TOKEN`, `INVALID_CREDENTIALS` |
| 403 | papel errado, eleição de outro admin, eleitor revogado | `FORBIDDEN`, `VOTER_REVOKED` |
| 404 | recurso inexistente ou código de eleitor desconhecido | `*_NOT_FOUND`, `NOT_FOUND`, `INVALID_CODE` |
| 409 | regra de negócio violada ou gravação concorrente | demais códigos do domínio, `VERSION_CONFLICT` |
| 410 | voto depois do prazo (e da tolerância) | `ROUND_EXPIRED` |
| 429 | excesso de tentativas de entrada (com `Retry-After`) | `RATE_LIMITED` |
| 500 | erro inesperado (a mensagem interna não vaza) | `INTERNAL_ERROR` |

## Rotas públicas

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/health` | — | `200 { status: 'ok' }` |
| POST | `/api/admin/login` | `{ username, password }` | `200 { token }` · `401 INVALID_CREDENTIALS` · `429` |
| POST | `/api/voter/session` | `{ code }` (8 caracteres; minúsculas são aceitas) | `200 { token, electionId, electionName }` · `404 INVALID_CODE` · `403 VOTER_REVOKED` · `429` |

**Limite de tentativas** (por rota e por IP, janela fixa de 1 min; desligável com `RATE_LIMIT=off`): 10 logins e 60 entradas de eleitor. A partir da tentativa seguinte, `429 RATE_LIMITED` com o cabeçalho `Retry-After` em segundos.

```http
POST /api/voter/session
{ "code": "gcj3be2d" }

200 { "token": "eyJhbGciOiJIUzI1NiJ9...", "electionId": "e-1", "electionName": "Grêmio 2026" }
```

```http
POST /api/voter/session
{ "code": "ZZZZZZZZ" }

404 { "error": { "code": "INVALID_CODE", "message": "Unknown voter code" } }
```

## Rotas do admin (token de admin)

Todas as rotas `/:id` recusam a eleição de outro admin com `403 FORBIDDEN` e a inexistente com `404 ELECTION_NOT_FOUND`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/admin/me` | — | `{ id, username }` |
| GET | `/api/elections` | — | `ElectionSummaryDTO[]`, na ordem de criação |
| POST | `/api/elections` | `{ name, defaultVotingSeconds? }` (5 a 3600 s; padrão 60) | `201 AdminElectionDTO` |
| GET | `/api/elections/:id` | — | `AdminElectionDTO` |
| PATCH | `/api/elections/:id` | `{ name?, defaultVotingSeconds? }` | `AdminElectionDTO` |
| POST | `/api/elections/:id/positions` | `{ title, tiebreak }` (`YOUNGEST` \| `OLDEST` \| `MOST_REMAINING_TIME`) | `201 AdminElectionDTO` |
| PATCH | `/api/elections/:id/positions/:pid` | `{ title?, tiebreak? }` | `AdminElectionDTO` |
| DELETE | `/api/elections/:id/positions/:pid` | — | `AdminElectionDTO` |
| PUT | `/api/elections/:id/queue` | `{ positionIds }` | `AdminElectionDTO` |
| GET | `/api/elections/:id/queue/suggestion` | — | `{ positionIds }` (só sugere; não grava) |
| POST | `/api/elections/:id/candidates` | `{ name, age, remainingMonths, applications, firstChoicePositionId }` | `201 AdminElectionDTO` |
| PATCH | `/api/elections/:id/candidates/:cid` | os mesmos campos, opcionais | `AdminElectionDTO` |
| DELETE | `/api/elections/:id/candidates/:cid` | — | `AdminElectionDTO` |
| POST | `/api/elections/:id/positions/:pid/candidates/:cid` | — | anexa um candidato existente ao cargo → `AdminElectionDTO` |
| POST | `/api/elections/:id/voters` | `{ count, labels? }` (1 a 500) | `201 { codes, election: AdminElectionDTO }` |
| DELETE | `/api/elections/:id/voters/:vid` | — | revoga o eleitor → `AdminElectionDTO` |
| POST | `/api/elections/:id/open` | — | abre a eleição → `AdminElectionDTO` |
| GET | `/api/elections/:id/next` | — | `NextPositionDTO` |
| POST | `/api/elections/:id/rounds` | `{ positionId, durationSeconds? }` | `201 AdminElectionDTO` |
| POST | `/api/elections/:id/rounds/:rid/close` | — | fecha antes do prazo → `AdminElectionDTO` |
| POST | `/api/elections/:id/positions/:pid/runoff` | `{ durationSeconds? }` (corpo opcional) | `201 AdminElectionDTO` |
| POST | `/api/elections/:id/positions/:pid/defer` | — | adia o cargo para o fim da fila → `AdminElectionDTO` |
| POST | `/api/elections/:id/positions/:pid/cancel` | `{ confirmTitle }` (título exato do cargo) | `AdminElectionDTO` · `409 CONFIRMATION_MISMATCH` |
| POST | `/api/elections/:id/rounds/:rid/release` | — | libera o resultado aos eleitores → `AdminElectionDTO` |
| POST | `/api/elections/:id/rounds/:rid/annul` | — | anula a rodada; o cargo volta ao topo da fila → `AdminElectionDTO` |
| POST | `/api/elections/:id/undo` | — | desfaz o último passo do admin → `AdminElectionDTO` · `409 NOTHING_TO_UNDO` |
| POST | `/api/elections/:id/finish` | — | encerra a eleição → `AdminElectionDTO` |

**Desfazer.** Só os comandos do admin são passos desfazíveis (até 50 por padrão; variável `HISTORY_LIMIT`). O voto e o fechamento por prazo não são: desfazer um passo descarta os votos registrados depois dele, e desfazer depois de um fechamento por prazo descarta a rodada inteira.

### Exemplos

```http
POST /api/admin/login
{ "username": "admin", "password": "secret123" }

200 { "token": "eyJhbGciOiJIUzI1NiJ9..." }
```

```http
POST /api/elections
Authorization: Bearer <token do admin>
{ "name": "Grêmio 2026" }

201 {
  "election": {
    "id": "e-1", "adminId": "a-1", "name": "Grêmio 2026", "status": "DRAFT",
    "defaultVotingSeconds": 60, "positions": [], "queue": [], "candidates": [],
    "voters": [], "rounds": [], "version": 0
  },
  "next": { "status": "NONE_LEFT" },
  "canUndo": false,
  "serverNow": "2026-11-26T06:47:47.525Z"
}
```

```http
POST /api/elections/e-1/candidates
{ "name": "Ana", "age": 33, "remainingMonths": 12, "applications": ["p-1"], "firstChoicePositionId": "p-1" }

201 AdminElectionDTO
```

```http
POST /api/elections/e-1/voters
{ "count": 2, "labels": ["Mesa 1", "Mesa 2"] }

201 { "codes": ["GCJ3BE2D", "TJ2SDQNX"], "election": AdminElectionDTO }
```

```http
GET /api/elections

200 [{ "id": "e-1", "name": "Grêmio 2026", "status": "DRAFT", "positionCount": 1, "voterCount": 2 }]
```

```http
GET /api/elections/e-1/next

200 { "status": "READY", "positionId": "p-1" }
```

```http
POST /api/elections/e-1/rounds
{ "positionId": "p-1", "durationSeconds": 120 }

201 {
  "election": { ... },
  "currentRound": {
    "roundId": "r-1", "positionTitle": "Presidente", "kind": "FIRST",
    "candidates": [{ "id": "c-ana", "name": "Ana" }, { "id": "c-bia", "name": "Bia" }],
    "deadline": "2026-11-26T06:50:26.664Z",
    "votedCount": 0, "eligibleCount": 2
  },
  "next": { "status": "ROUND_IN_PROGRESS", "positionId": "p-1" },
  "canUndo": true,
  "serverNow": "2026-11-26T06:48:26.664Z"
}
```

Quando o último eleitor vota, a rodada fecha sozinha e o admin já vê o resultado (os eleitores ainda não):

```http
GET /api/elections/e-1

200 {
  "election": { ... },
  "lastResult": {
    "roundId": "r-1", "positionTitle": "Presidente", "kind": "FIRST",
    "counts": [
      { "candidateId": "c-ana", "name": "Ana", "votes": 1 },
      { "candidateId": "c-bia", "name": "Bia", "votes": 0 }
    ],
    "blank": 1, "validVotes": 1,
    "outcome": "ELECTED", "electedCandidateId": "c-ana", "tiebreakApplied": false
  },
  "next": { "status": "NONE_LEFT" },
  "canUndo": true,
  "serverNow": "2026-11-26T06:48:26.900Z"
}
```

```http
POST /api/elections/e-1/positions/p-1/cancel        (eleição já encerrada)
{ "confirmTitle": "x" }

409 { "error": { "code": "ELECTION_FINISHED", "message": "A finished election cannot be changed" } }
```

## Rotas do eleitor (token de eleitor)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/voter/state` | — | `VoterStateDTO` |
| POST | `/api/voter/votes` | `{ roundId, choice }` (`choice` = id do candidato ou `'BLANK'`) | `204` · `409 VOTER_ALREADY_VOTED` · `410 ROUND_EXPIRED` · `404 ROUND_NOT_FOUND` |

Um token cuja eleição não existe mais é recusado com `401 INVALID_TOKEN`; um eleitor revogado, com `403 VOTER_REVOKED`.

O `VoterStateDTO` tem uma fase por momento da eleição:

```jsonc
// rodada aberta e o eleitor ainda não votou
{ "phase": "VOTING", "serverNow": "...", "round": {
    "roundId": "r-1", "positionTitle": "Presidente", "kind": "FIRST",
    "candidates": [{ "id": "c-ana", "name": "Ana" }, { "id": "c-bia", "name": "Bia" }],
    "deadline": "2026-11-26T06:50:26.664Z" } }
// já votou nesta rodada
{ "phase": "VOTED", "roundId": "r-1", "serverNow": "..." }
// sem rodada aberta e sem resultado liberado
{ "phase": "WAITING", "electionName": "Grêmio 2026", "serverNow": "..." }
// resultado liberado pelo admin (mesmo formato do lastResult acima)
{ "phase": "RESULTS", "result": { "outcome": "ELECTED", "electedCandidateId": "c-ana", ... }, "serverNow": "..." }
// eleição encerrada
{ "phase": "FINISHED", "serverNow": "..." }
```

```http
POST /api/voter/votes
Authorization: Bearer <token do eleitor>
{ "roundId": "r-1", "choice": "c-ana" }

204
```

```http
POST /api/voter/votes        (mesmo eleitor, de novo)
{ "roundId": "r-1", "choice": "c-ana" }

409 { "error": { "code": "VOTER_ALREADY_VOTED", "message": "This voter already voted" } }
```

## Tempo real (Socket.IO)

Conexão no caminho padrão `/socket.io`, com o token no handshake:

```ts
const socket = io(URL, { auth: { token } });
```

Token ausente ou inválido recusa a conexão com o erro `INVALID_TOKEN` (`connect_error`). O servidor sempre envia o **estado inteiro**, nunca diferenças; ao reconectar, o cliente relê pelo REST (`GET /api/elections/:id` ou `GET /api/voter/state`).

| Direção | Evento | Payload | Quem recebe / efeito |
|---|---|---|---|
| cliente → servidor | `admin:watch` | `{ electionId }` | Só admin. Se a eleição for dele, entra na sala `admin:<electionId>` e recebe `admin:state` na hora. Eleição de outro admin ou inexistente: nada acontece e a conexão continua. |
| servidor → cliente | `admin:state` | `AdminElectionDTO` | Sala `admin:<electionId>`, depois de toda gravação: comandos do admin, cada voto, fechamento por prazo e desfazer. |
| servidor → cliente | `voter:state` | `VoterStateDTO` daquele eleitor | Sala `voter:<voterId>` (o eleitor entra nela ao conectar), para cada eleitor credenciado, depois de toda gravação da eleição. |

Votar não passa pelo socket: é sempre `POST /api/voter/votes`.

## Arquivos do front

Fora de `/api` e `/socket.io`, o servidor de produção serve o build do front (`WEB_DIST_DIR`): os arquivos do build como estão, e qualquer outro `GET` recebe o `index.html`, para o roteador do navegador decidir a tela. Exceções, que recebem `404 NOT_FOUND` em JSON: caminhos de `/api` e `/socket.io` sem rota, e caminhos que terminam em extensão de arquivo (ex.: um `/assets/app-antigo.js` pedido por uma aba aberta antes de um deploy).
