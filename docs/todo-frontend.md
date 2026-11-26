# TO-DO — Integrante C (Frontend + e2e)

Este arquivo é a memória de trabalho do agente de IA da parte C. Ele organiza as tarefas C2–C24 em
ordem de implementação, com dependências reais, comportamentos a testar e a divisão entre
`apps/web` e `e2e/`.

Documentos de referência (leia as seções citadas em cada tarefa):
- [architecture.md](architecture.md): §2 (stack), §3 (direção dos imports), §6 (REST),
  §7 (Socket.IO), §9 (frontend), §10 (testes), §14 (run/build/deploy).
- [divisao-tarefas.md](divisao-tarefas.md): §5 (tarefas de C) e regras de convivência.
- [todo-backend.md](todo-backend.md): contratos já implementados pelo B e *Notas do agente*.
- [todo-domain.md](todo-domain.md): regras de negócio já implementadas por A.
- `CLAUDE.md` (raiz): TDD, TSDoc, nomes em inglês, testes, cobertura e comandos obrigatórios.

## Como o agente usa este arquivo

1. **Antes de qualquer tarefa**, leia este arquivo inteiro e confira as tarefas `[x]` e as
   *Notas do agente*.
2. **Execute apenas a próxima subtarefa `[ ]`** da lista abaixo, exceto quando o
   usuário indicar outra. Os títulos C2–C24 continuam identificando o escopo arquitetural.
3. Confira o campo **Depende de**. C não deve esperar o servidor real: até o marco M2, C2–C16
   usam o contrato de `@voto/shared`, MSW e socket fake.
4. Faça RED antes de GREEN. Escreva comportamentos de caminho feliz, erro e limites.
5. Ao concluir uma tarefa:
   - troque `[ ]` por `[x]`;
   - preencha as *Notas do agente* no modelo abaixo;
   - atualize o "Mapa rápido do código";
   - não faça commit.
6. Não altere `packages/shared`, `packages/domain`, `apps/server`, a raiz do monorepo ou
   `.github/workflows/`. Esses contratos e arquivos são de B/A. Contrato ambíguo ou mudança
   necessária em `shared` exige pedir confirmação antes de agir.
7. Tarefas futuras podem ser divididas em subtarefas Cx.a/Cx.b quando ficarem grandes, mas os
   números C2–C24 devem continuar representando cada entrega.
8. Antes de concluir cada subtarefa, formate os arquivos alterados com
   `npx prettier --write <arquivos-alterados>` (use caminhos explícitos para não formatar arquivos
   de outras áreas). Depois execute `npm run format:check`, `npm run lint` e `npm run typecheck`;
   ao concluir o trabalho completo, rode também `npm run test:coverage` no repositório inteiro.
   Não marque a subtarefa como concluída se o `format:check` falhar.

**Modelo das Notas do agente:**

```text
- Feito: <1–2 linhas sobre o que passou a existir>
- Arquivos: <caminhos principais>
- Como usar: <API, hook, componente ou rota criada>
- Testes: <arquivos de teste e quantidade de testes>
- Decisões: <escolhas não óbvias; "nenhuma" se não houver>
```

**Git.** Não rode `git commit`, `git push` nem crie branches. Trabalhe em `apps/web` e em `e2e/`.
Mudanças em `ci.yml` devem ser combinadas com B; C22 registra a tarefa, mas não edita esse arquivo
por conta própria.

---

## Contexto atual

- O S0.5 já criou o esqueleto de `apps/web`: React 19, Vite, React Router, Vitest/jsdom,
  Testing Library e o teste da rota `/`.
- S0.3 já deixou prontos em `@voto/shared` os DTOs, os schemas Zod, `BLANK`, `ERROR_CODES`,
  `SOCKET_EVENTS` e os tipos dos eventos.
- B6 já implementou login e autorização de admin; B8–B12 implementaram a configuração e o ciclo;
  B13 implementou sessão e voto do eleitor; B15 implementou Socket.IO.
- Até o M2, use MSW e `createFakeSocket()`. Não use o domínio nem o servidor diretamente no
  frontend; o único workspace compartilhado permitido é `@voto/shared`.
- C deve usar nomes, status e bodies exatamente como estão em `packages/shared/src/dto.ts`,
  `api-schemas.ts` e `socket-events.ts`.

## Dados fictícios para mocks e test doubles (C2–C16)

- Use Faker quando dados realistas ajudarem a exercitar mocks MSW, factories ou test doubles; ele
  é opcional para casos pequenos em que valores literais tornam o cenário mais claro.
- Faker é somente uma fonte de dados de teste. Nunca use valores gerados para decidir regras,
  esconder o dado importante do cenário ou substituir o DTO/contrato real de `@voto/shared`.
- Mantenha nomes, status, códigos de erro, quantidade de votos, candidaturas, prazos e demais
  valores que determinam o comportamento explícitos no teste. Faker pode preencher apenas campos
  irrelevantes à asserção, como nomes/rótulos de apoio.
- Qualquer uso deve ser determinístico e isolado por teste/factory: fixe a seed, evite estado
  aleatório global compartilhado e não dependa de valores diferentes entre execuções.
- Configure o locale com uma instância própria por factory ou teste:
  `import { Faker, pt_BR } from '@faker-js/faker'`, `new Faker({ locale: [pt_BR] })` e
  `faker.seed(20261125)`. Reutilize `createTestFaker(seed?)` de
  `apps/web/test/utils/faker.ts`; não use o singleton global `faker`.
- Faker só entra em testes, handlers MSW e doubles; nunca em código de produção.
- `@faker-js/faker` está instalado como dependência de desenvolvimento de `apps/web`; a autorização
  para adicioná-lo foi concedida. Seu uso continua restrito a testes, handlers MSW e doubles e deve
  seguir as regras de determinismo acima.

---

## Avaliação e plano de commits

Cada subtarefa abaixo é uma unidade que pode passar por TDD e terminar verde antes do próximo
commit. Uma tarefa não dividida representa uma única entrega; tarefas divididas não devem ser
agrupadas em um único commit.

| Tarefa | Avaliação | Plano de commits |
|---|---|---|
| C2 | Divide-se: rede simulada e testes auxiliares são dependências distintas | `[x] C2.a` handlers MSW; `[x] C2.b` providers/fábricas |
| C3 | Divide-se: transporte/erro e API pública podem ser validados separadamente | `[x] C3.a` núcleo de `fetch` e `ErrorDTO`; `[x] C3.b` métodos tipados de cada grupo de rotas |
| C4 | Divide-se: o cliente real e a injeção por fake têm responsabilidades independentes | `[x] C4.a` interface e cliente Socket.IO; `[x] C4.b` `SocketProvider` e `createFakeSocket()` |
| C5 | Divide-se: cada grupo de funções puras tem limite e teste próprios | `[x] C5.a` countdown corrigido por `serverNow`; `[x] C5.b` porcentagens e rótulos |
| C6 | Divide-se: confirmações e componentes informativos podem subir em PRs separados | `[x] C6.a` diálogos de confirmação; `[ ] C6.b` `Countdown` e `ErrorMessage` |
| C7 | Divide-se: formulário/rota e integração da sessão são dois comportamentos fechados | `[ ] C7.a` formulário e armazenamento do token; `[ ] C7.b` navegação e erros da sessão |
| C8 | Divide-se: a camada reativa e a cédula podem ser verificadas separadamente | `[ ] C8.a` `useVoterSession` e fases `WAITING`/estado inicial; `[ ] C8.b` cédula e voto candidato/branco |
| C9 | Divide-se: fases finais e reconexão têm ciclos de teste diferentes | `[ ] C9.a` `VOTED`, `RESULTS` e `FINISHED`; `[ ] C9.b` reconexão e ordenação de estado |
| C10 | Divide-se: login em si não exige a proteção de toda a árvore de rotas | `[ ] C10.a` login, token e `/admin/me`; `[ ] C10.b` rotas protegidas e logout |
| C11 | Divide-se: leitura da lista e mutação/criação têm UI e testes distintos | `[ ] C11.a` lista de eleições; `[ ] C11.b` criação e navegação |
| C12 | Divide-se: adicionar/editar cargos não inclui remover e confirmar | `[ ] C12.a` criar e editar cargos; `[ ] C12.b` remover cargo e confirmar estado permitido |
| C13 | Divide-se: cadastro/validação e edição/removal têm casos próprios | `[ ] C13.a` criar candidato e validações; `[ ] C13.b` editar/remover candidato |
| C14 | Divide-se: eleitores e fila são abas independentes com contratos próprios | `[ ] C14.a` gerar, listar, copiar e revogar códigos; `[ ] C14.b` ordem, sugestão e confirmação |
| C15 | Divide-se: sincronização via socket e controles ao vivo podem ser validados separadamente | `[ ] C15.a` `useAdminElection` e ressincronização; `[ ] C15.b` abrir rodada, prazo e fechar antes |
| C16 | Divide-se: resolução de rodada e ações de cargo insuficiente são fluxos distintos | `[ ] C16.a` resultado, 2º turno, liberar, desfazer e anular; `[ ] C16.b` anexar, adiar e cancelar |
| C17 | Divide-se: configuração do runner e dados de preparação são entregáveis separadas | `[ ] C17.a` `playwright.config.ts` e `webServer`; `[ ] C17.b` fixtures e helpers de API |
| C18 | Não divide: uma jornada curta e linear de configuração | `[ ] C18` uma spec administrativa completa |
| C19 | Divide-se: preparação de contexto/votos e liberação/verificação são dois grupos de risco | `[ ] C19.a` três contextos, entrada e votos; `[ ] C19.b` fechamento e liberação do resultado |
| C20 | Divide-se: montagem do cenário e ação do 2º turno têm verificações independentes | `[ ] C20.a` cenário de `AWAITING_RUNOFF`; `[ ] C20.b` abrir 2º turno e verificar vencedor |
| C21 | Divide-se: elegibilidade do eleito e candidatos insuficientes são cenários separados | `[ ] C21.a` exclusão do eleito no cargo seguinte; `[ ] C21.b` cargo sem candidatos e confirmação |
| C22 | Divide-se: desfazer e invalidade/integração não precisam estar no mesmo commit | `[ ] C22.a` e2e de `undo`; `[ ] C22.b` código inválido e coordenação da execução no CI |
| C23 | Divide-se: semântica acessível e layout responsivo podem ser revisados separadamente | `[ ] C23.a` labels, roles, foco e mensagens; `[ ] C23.b` layout móvel e estados visíveis |
| C24 | Divide-se: revisar duas pirâmides de testes separadamente reduz o risco | `[ ] C24.a` test smells no front; `[ ] C24.b` test smells nos e2e e cobertura final |

**Ordem de execução:** C2–C6 podem começar assim que o esqueleto estiver disponível. C7–C16 seguem
as dependências internas da lista original. C17–C22 aguardam o M2, exceto pela estrutura que puder
ser preparada sem servidor real. C23 pode avançar após C6 e C24 só deve começar após C23.

---

## Mapa rápido do código

> Atualizar esta seção quando cada tarefa criar módulos novos.

- `apps/web/src/App.tsx` → tabela atual de rotas do frontend; hoje só contém `/`.
- `apps/web/src/main.tsx` → composição do `BrowserRouter` e da árvore React; objeto humilde,
  excluído da cobertura.
- `apps/web/vite.config.ts` → proxy `/api` e `/socket.io` para `localhost:3000`.
- `apps/web/test/setup.ts` → jest-dom e cleanup do Testing Library.
- `apps/web/test/App.test.tsx` → teste de fumaça do esqueleto atual.
- `apps/web/src/api/api-client.ts` → transporte REST com prefixo `/api`, Bearer, JSON e `ApiError`.
- `apps/web/src/api/admin-api.ts` → métodos REST tipados de autenticação, configuração e controle do admin.
- `apps/web/src/api/voter-api.ts` → criação de sessão, leitura de estado e envio de voto.
- `apps/web/src/api/public-api.ts` → consulta pública de saúde da API.
- `apps/web/src/api/socket-client.ts` → cliente Socket.IO tipado, handshake autenticado e listeners removíveis.
- `apps/web/src/api/socket-provider.tsx` → contexto de estado realtime com criação/limpeza do cliente por sessão.
- `apps/web/src/components/ConfirmDialog.tsx` e `DoubleConfirmDialog.tsx` → diálogos acessíveis de confirmação simples e por título exato.
- `apps/web/src/components/Countdown.tsx` e `ErrorMessage.tsx` → timer acessível sincronizado ao servidor e mensagem acessível de erro da API.
- `apps/web/src/lib/countdown.ts` → cálculo puro dos segundos restantes com deslocamento do relógio do servidor.
- `apps/web/src/lib/format.ts` → percentual de votos válidos e rótulos legíveis das regras de desempate.
- `apps/web/test/api-client.test.ts` → testes MSW do núcleo REST e dos formatos de resposta.
- `apps/web/test/api-methods.test.ts` → contratos MSW de rota, método, token e corpo de cada operação REST.
- `apps/web/test/socket-client.test.ts` → testes do handshake, `admin:watch`, estados recebidos e limpeza de listeners.
- `apps/web/test/socket-client.integration.test.ts` → rodada local efêmera com o cliente e servidor Socket.IO reais.
- `apps/web/test/utils/fake-socket.ts` → fake injetável com controle de conexão, eventos e eleições observadas.
- `apps/web/test/socket-provider.test.tsx` e `fake-socket.test.ts` → estado do contexto, descarte e ciclo de vida do fake.
- `apps/web/test/countdown.test.ts` → prazo futuro, limites, expiração, offset de relógio e datas inválidas.
- `apps/web/test/confirmation-dialogs.test.tsx` → comportamento, acessibilidade, cancelamento e título exato dos diálogos.
- `apps/web/test/reusable-status-components.test.tsx` → atualização/expiração do timer e anúncio do código/mensagem de erro.
- `apps/web/test/format.test.ts` → porcentagens, zero votos válidos, arredondamento e rótulos de desempate.
- `apps/web/test/utils/render-with-providers.tsx` → `renderWithProviders` com MemoryRouter e providers auth/socket injetáveis.
- `apps/web/test/utils/faker.ts` → fábrica isolada do Faker com locale `pt_BR` e seed fixa.
- `apps/web/test/utils/factories.ts` → factories dos DTOs; nomes acessórios são localizados e reproduzíveis.
- `apps/web/test/utils.test.tsx` → testes da composição de providers, isolamento e factories.
- `e2e/` → ainda não existe; será criado por C17 ou por uma subdivisão dela.
- Módulos novos planejados:
  - `apps/web/src/api/` → I/O REST e Socket.IO;
  - `apps/web/src/lib/` → lógica pura de tempo, porcentagens e rótulos;
  - `apps/web/src/components/` → componentes reutilizáveis;
  - `apps/web/src/features/voter/` → entrada, espera, cédula e fases finais;
  - `apps/web/src/features/admin/auth/` → login e proteção de rotas;
  - `apps/web/src/features/admin/elections/` → listagem e criação;
  - `apps/web/src/features/admin/config/` → configuração da eleição;
  - `apps/web/src/features/admin/live/` → painel ao vivo;
  - `apps/web/test/msw/` e `apps/web/test/utils/` → rede simulada e provedores de teste.
  - `apps/web/test/msw/mock-api-server.ts` → servidor MSW em memória para as rotas REST do frontend.

---

## Tarefas

### [x] C2.a — Handlers MSW
**Ref.:** architecture §6 e §10.1.
**Depende de:** S0.5 concluído; S0.3b concluído.
**Fazer:** criar handlers MSW com estado em memória isolado, cobertura das rotas REST usadas pelas
telas C7–C16 e respostas coerentes de sucesso e erro.
**Testes (escrever antes):** um handler válido devolve o DTO correto; respostas 400/401/403/404/409/410
seguem `ErrorDTO`.
**Pronto quando:** rede de teste funciona sem servidor real, o estado pode ser resetado e
`npm run format:check` passa para os arquivos alterados.
**Arquivos:** `apps/web/test/msw/`.
**Commit sugerido:** `test(web): adiciona handlers MSW para o contrato da API`
**Notas do agente:**
- Feito: servidor MSW em memória com health, auth, eleições, cargos, candidatos, eleitores, fila,
  votação e ações de resolução; reset volta o estado inicial entre testes.
- Arquivos: `apps/web/test/msw/mock-api-server.ts`, `apps/web/test/msw/msw.test.ts`,
  `apps/web/package.json`, `package-lock.json`.
- Como usar: `createMockApiServer()`; `listen()` no `beforeAll`, `reset()` no `afterEach`,
  `close()` no `afterAll`.
- Testes: `apps/web/test/msw/msw.test.ts` (4 testes: health, `INVALID_CODE`, credenciais inválidas
  e criação/listagem administrativa; mais um verifica o nome inicial determinístico em pt-BR).
- Decisões: MSW 3.0.7 usa `SetupServer`; o nome acessório da eleição usa Faker localizado e seed
  fixa, enquanto IDs, status, códigos e regras do mock permanecem explícitos.

### [x] C2.b — Providers e fábricas de teste
**Ref.:** architecture §9 e §10.1.
**Depende de:** C2.a.
**Fazer:** criar `renderWithProviders`, fábricas de DTO e reset compartilhado, sem estado global.
Factories usam `createTestFaker()` de `apps/web/test/utils/faker.ts` para nomes acessórios,
com locale `pt_BR` e seed fixa; valores relevantes ao comportamento permanecem explícitos ou têm
defaults determinísticos.
**Testes (escrever antes):** providers não vazam estado; fábricas permitem sobrescritas mínimas.
**Pronto quando:** componentes podem ser renderizados com router, auth e socket configuráveis.
**Arquivos:** `apps/web/test/utils/`, `apps/web/test/setup.ts`.
**Commit sugerido:** `test(web): adiciona providers e fábricas de dados`
**Notas do agente:**
- Feito: `renderWithProviders` compõe `MemoryRouter` com providers de auth/socket injetáveis;
  factories determinísticas cobrem os DTOs usados pelo frontend.
- Arquivos: `apps/web/test/utils/render-with-providers.tsx`, `apps/web/test/utils/factories.ts`,
  `apps/web/test/utils.test.tsx`.
- Como usar: `renderWithProviders(ui, { initialEntries, authProvider, socketProvider })`;
  factories `makeAdminElectionDTO`, `makeVoterStateDTO`, `makeElectionSummaryDTO`,
  `makeRoundView`, `makeRoundResultDTO` e `makeErrorDTO` aceitam overrides.
- Testes: `apps/web/test/utils.test.tsx` (8: composição, isolamento, overrides e localização/
  determinismo dos dados fictícios).
- Decisões: nomes e rótulos acessórios usam Faker `pt_BR` por instância isolada; IDs, títulos de
  cargo, status, votos e prazos continuam explícitos. A limpeza de RTL já ocorre em `test/setup.ts`.

### [x] C3.a — Núcleo tipado do cliente REST
**Ref.:** architecture §6.1–§6.3.
**Depende de:** C2.b.
**Fazer:** criar `fetch` tipado, token Bearer, prefixo `/api`, `ErrorDTO` tipado e tratamento de 204.
**Testes (escrever antes):** autorização; serialização; JSON de erro; resposta vazia; resposta não JSON.
**Pronto quando:** o núcleo HTTP retorna dados tipados ou um erro controlado.
**Arquivos:** `apps/web/src/api/api-client.ts`.
**Commit sugerido:** `feat(web): cria núcleo tipado do cliente REST`
**Notas do agente:**
- Feito: transporte REST adiciona prefixo `/api`, Bearer opcional, corpo JSON, validação do
  `ErrorDTO`, erro `ApiError` tipado e resposta sem corpo `204`.
- Arquivos: `apps/web/src/api/api-client.ts`, `apps/web/test/api-client.test.ts`.
- Como usar: `apiRequest<T>('/endpoint', { method, token, body, signal })`; respostas `204`
  resultam em `undefined`, e falhas controladas expõem status e erro compartilhado quando válido.
- Testes: `apps/web/test/api-client.test.ts` (6 testes de transporte, serialização e respostas).
- Decisões: corpos de erro só são expostos como `ErrorDTO` quando passam pela validação do
  formato e do catálogo de códigos de `@voto/shared`; respostas não JSON geram `ApiError`.

### [x] C3.b — Métodos REST das telas
**Ref.:** architecture §6.1–§6.2.
**Depende de:** C3.a.
**Fazer:** agrupar métodos por admin, eleitor e público sem espalhar `fetch` pelos componentes.
**Testes (escrever antes):** método GET/POST/PATCH/DELETE usa rota, método e body corretos.
**Pronto quando:** C7–C16 podem chamar toda a API por funções do cliente.
**Arquivos:** `apps/web/src/api/admin-api.ts`, `voter-api.ts`, `public-api.ts`,
`api-client.ts`, `apps/web/test/api-methods.test.ts`.
**Commit sugerido:** `feat(web): adiciona métodos REST de admin e eleitor`
**Notas do agente:**
- Feito: métodos REST tipados foram agrupados em `adminApi`, `voterApi` e `publicApi`; respostas obrigatórias sem corpo geram `ApiError`.
- Arquivos: `apps/web/src/api/admin-api.ts`, `voter-api.ts`, `public-api.ts`, `api-client.ts` e `apps/web/test/api-methods.test.ts`.
- Como usar: importe o grupo apropriado e chame os métodos, por exemplo `adminApi.listElections(token)` ou `voterApi.castVote(token, body)`.
- Testes: `apps/web/test/api-methods.test.ts` (34 testes cobrindo todas as operações, identificadores de rota, verbos, autenticação e corpos).
- Decisões: IDs dinâmicos são codificados como segmentos de URL; o voto aceita a resposta `204`, enquanto endpoints com DTO obrigatório rejeitam resposta sem corpo.

### [x] C4.a — Cliente Socket.IO
**Ref.:** architecture §7.
**Depende de:** C2.b.
**Fazer:** criar interface tipada e cliente com `SOCKET_EVENTS`, token no handshake e listeners seguros.
**Testes (escrever antes):** conexão usa auth; admin watch envia ID; dois eventos recebem DTOs; desconexão limpa listeners.
**Pronto quando:** o cliente real conversa com o gateway pelo contrato compartilhado.
**Arquivos:** `apps/web/src/api/socket-client.ts`, `apps/web/test/socket-client.test.ts`,
`apps/web/test/socket-client.integration.test.ts`, `apps/web/package.json`, `package-lock.json`.
**Commit sugerido:** `feat(web): cria cliente tipado de Socket.IO`
**Notas do agente:**
- Feito: cliente Socket.IO usa os eventos e DTOs de `@voto/shared`, autentica pelo token no handshake, permite `admin:watch` e remove listeners ao desinscrever ou desconectar.
- Arquivos: `apps/web/src/api/socket-client.ts`, `apps/web/test/socket-client.test.ts`, `apps/web/test/socket-client.integration.test.ts`, `apps/web/package.json`, `package-lock.json`.
- Como usar: crie `createSocketClient(token)`, registre `onAdminState`/`onVoterState` e use o callback retornado para remover um listener; `disconnect()` limpa os ativos e encerra a conexão.
- Testes: 5 testes unitários em `apps/web/test/socket-client.test.ts` e 1 integração em `apps/web/test/socket-client.integration.test.ts` com servidor local em porta efêmera.
- Decisões: URL `'/'` usa a mesma origem e o proxy Socket.IO do Vite; a fábrica injetável permite testes isolados, e a integração confirma o adapter real sem depender de serviço externo.

### [x] C4.b — SocketProvider e fake
**Ref.:** architecture §7 e §9.
**Depende de:** C4.a.
**Fazer:** criar provider injetável e `createFakeSocket()` substituível pelos testes.
Payloads do fake devem usar DTOs válidos; dados gerados com Faker, se houver autorização, ficam
limitados aos campos não relevantes à asserção e usam seed fixa.
**Testes (escrever antes):** consumidor recebe estado novo e substitui o anterior; fake conecta/desconecta.
**Pronto quando:** componentes não importam a implementação concreta do socket.
**Arquivos:** `apps/web/src/api/socket-provider.tsx`, `apps/web/test/utils/fake-socket.ts`,
`apps/web/test/socket-provider.test.tsx`, `apps/web/test/fake-socket.test.ts`.
**Commit sugerido:** `test(web): adiciona socket fake e provider injetável`
**Notas do agente:**
- Feito: provider mantém o snapshot mais recente de admin/eleitor, expõe `watchAdmin`, não abre conexão sem token e encerra listeners/conexão no descarte.
- Arquivos: `apps/web/src/api/socket-provider.tsx`, `apps/web/test/utils/fake-socket.ts`, `apps/web/test/socket-provider.test.tsx`, `apps/web/test/fake-socket.test.ts`.
- Como usar: envolva componentes com `<SocketProvider token={token}>` e leia `useSocket()`; injete `createClient` para fornecer `createFakeSocket()` nos testes.
- Testes: 5 testes de provider e 1 teste do fake cobrindo substituição de snapshots, ausência de token, watch, cleanup e conexão/desconexão.
- Decisões: o fake inicia conectado, como o cliente Socket.IO real; mensagens emitidas enquanto desconectado não chegam aos listeners.

### [x] C5.a — Countdown corrigido pelo servidor
**Ref.:** architecture §8.3.
**Depende de:** contratos de `@voto/shared`.
**Fazer:** calcular tempo restante comparando deadline ISO com o deslocamento de `serverNow`.
**Testes (escrever antes):** futuro, limite exato, vencido e relógios do cliente desincronizados.
**Pronto quando:** countdown é puro e determinístico.
**Arquivos:** `apps/web/src/lib/countdown.ts`, `apps/web/test/countdown.test.ts`.
**Commit sugerido:** `feat(web): calcula countdown sincronizado com o servidor`
**Notas do agente:**
- Feito: cálculo puro dos segundos restantes usa o offset entre `serverNow` e a hora local capturada na sincronização; prazos vencidos são limitados a zero.
- Arquivos: `apps/web/src/lib/countdown.ts`, `apps/web/test/countdown.test.ts`.
- Como usar: `getRemainingSeconds({ deadline, serverNow, clientNowAtSync, clientNow })`; o resultado arredonda para cima para manter segundos parciais visíveis.
- Testes: `apps/web/test/countdown.test.ts` (8 casos: futuro, arredondamento, limite exato, expirado, diferença de relógio e quatro campos de data inválidos).
- Decisões: a hora local no instante em que `serverNow` é recebido ancora o offset; o instante local atual é injetado, mantendo a função determinística e sem leitura direta do relógio do sistema.

### [x] C5.b — Porcentagens e rótulos
**Ref.:** architecture §5.4.
**Depende de:** C5.a.
**Fazer:** calcular porcentagens sobre válidos e rótulos dos três desempates.
**Testes (escrever antes):** zero votos válidos, arredondamento e todos os rótulos.
**Pronto quando:** formatação não contém regra implícita no componente.
**Arquivos:** `apps/web/src/lib/format.ts`, `apps/web/test/format.test.ts`.
**Commit sugerido:** `feat(web): adiciona formatação de votos e desempates`
**Notas do agente:**
- Feito: funções puras formatam o percentual calculado sobre votos válidos e os três rótulos de desempate; contagens inválidas são rejeitadas explicitamente.
- Arquivos: `apps/web/src/lib/format.ts`, `apps/web/test/format.test.ts`.
- Como usar: `formatVotePercentage(candidateVotes, validVotes)` retorna percentual inteiro com `%`; `formatTiebreakRule(rule)` retorna o nome legível da regra.
- Testes: `apps/web/test/format.test.ts` (13 casos de zero, arredondamento, unanimidade, valores inválidos e todos os rótulos).
- Decisões: percentuais são arredondados ao inteiro mais próximo; somente `0/0` representa legitimamente 0% quando não há votos válidos.

### [x] C6.a — Diálogos de confirmação
**Ref.:** architecture §9 e regra de dupla confirmação.
**Depende de:** C2.b.
**Fazer:** criar `ConfirmDialog` e `DoubleConfirmDialog` acessíveis; o segundo exige título exato.
**Testes (escrever antes):** confirmar/cancelar, nome vazio/diferente/exato.
**Pronto quando:** cancelamento e confirmação são acionados por callbacks explícitos.
**Arquivos:** `apps/web/src/components/ConfirmDialog.tsx`, `DoubleConfirmDialog.tsx`,
`apps/web/test/confirmation-dialogs.test.tsx`.
**Commit sugerido:** `feat(web): cria diálogos simples e de dupla confirmação`
**Notas do agente:**
- Feito: diálogos acessíveis delegam confirmação/cancelamento por callbacks; a confirmação dupla mantém o botão desabilitado até o título digitado corresponder exatamente.
- Arquivos: `apps/web/src/components/ConfirmDialog.tsx`, `DoubleConfirmDialog.tsx`, `apps/web/test/confirmation-dialogs.test.tsx`.
- Como usar: renderize com `open`, título/descrição e callbacks; para ação destrutiva, forneça `confirmationTitle` ao `DoubleConfirmDialog`.
- Testes: `apps/web/test/confirmation-dialogs.test.tsx` (10 casos: semântica acessível, aberto/fechado, confirmação/cancelamento, vazio, diferenças de caixa/espaço, correspondência exata e reset ao trocar o título esperado).
- Decisões: correspondência é literal e sensível a caixa e espaços, conforme a regra de título exato; ao fechar ou trocar o título esperado, o texto de confirmação é limpo.

### [x] C6.b — Countdown e mensagem de erro
**Ref.:** architecture §9.
**Depende de:** C5.b.
**Fazer:** criar componentes acessíveis `Countdown` e `ErrorMessage`.
**Testes (escrever antes):** countdown atualiza/vence; erro mostra código e mensagem legível.
**Pronto quando:** componentes reutilizáveis passam pelos seletores de role/label.
**Arquivos:** `apps/web/src/components/Countdown.tsx`, `ErrorMessage.tsx`,
`apps/web/test/reusable-status-components.test.tsx`.
**Commit sugerido:** `feat(web): cria countdown e mensagens de erro reutilizáveis`
**Notas do agente:**
- Feito: `Countdown` atualiza a cada segundo com o cálculo sincronizado ao servidor e para em zero; `ErrorMessage` anuncia o código e a mensagem do `ErrorDTO`.
- Arquivos: `apps/web/src/components/Countdown.tsx`, `ErrorMessage.tsx`, `apps/web/test/reusable-status-components.test.tsx`.
- Como usar: forneça ao `Countdown` `clock` com prazo, horário do servidor e instante local de sincronização; passe o `ErrorDTO` completo a `ErrorMessage`.
- Testes: `apps/web/test/reusable-status-components.test.tsx` (3 casos: atualização, expiração e anúncio acessível do erro).
- Decisões: a contagem usa o helper puro `getRemainingSeconds`; o timer acessível apresenta `MM:SS`, e o erro usa `role="alert"`.

### [ ] C7.a — Formulário de entrada do eleitor
**Ref.:** architecture §9 rota `/`.
**Depende de:** C3.b, C6.b.
**Fazer:** substituir a página provisória por campo de código, botão Entrar e validação local.
**Testes (escrever antes):** código válido inicia sessão; vazio não chama API.
**Pronto quando:** `/` é uma tela mobile, acessível e funcional.
**Arquivos:** `apps/web/src/features/voter/VoterEntryPage.tsx`.
**Commit sugerido:** `feat(web): cria entrada do eleitor por código`

### [ ] C7.b — Erros e navegação da sessão do eleitor
**Ref.:** architecture §6.2.
**Depende de:** C7.a.
**Fazer:** guardar token/electionId, navegar para `/votar` e mapear `INVALID_CODE`/`VOTER_REVOKED`.
**Testes (escrever antes):** sucesso navega; inválido e revogado mostram mensagens distintas.
**Pronto quando:** sessão criada é persistida apenas no que a UI precisa para continuar.
**Arquivos:** `apps/web/src/features/voter/`.
**Commit sugerido:** `feat(web): integra a sessão do eleitor à tela de voto`

### [ ] C8.a — Hook da sessão e fase WAITING
**Ref.:** architecture §6.2 e §7.
**Depende de:** C4.b, C5.b, C7.b.
**Fazer:** criar `useVoterSession`, consulta inicial e assinatura de `voter:state`.
**Testes (escrever antes):** WAITING exibe espera; reconexão recebe estado atual.
**Pronto quando:** hook substitui o estado local pelo estado recebido do servidor.
**Arquivos:** `apps/web/src/features/voter/useVoterSession.ts`.
**Commit sugerido:** `feat(web): adiciona hook da sessão do eleitor`

### [ ] C8.b — Cédula e registro do voto
**Ref.:** architecture §6.2.
**Depende de:** C8.a.
**Fazer:** renderizar candidatos, voto branco e countdown; postar voto por REST.
**Testes (escrever antes):** candidato e `BLANK`; já votou; rodada vencida.
**Pronto quando:** `/votar` permite votar uma vez enquanto a fase é VOTING.
**Arquivos:** `apps/web/src/features/voter/VoterVotePage.tsx`.
**Commit sugerido:** `feat(web): adiciona cédula e envio do voto`

### [ ] C9.a — Fases VOTED, RESULTS e FINISHED
**Ref.:** architecture §6.2.
**Depende de:** C8.b.
**Fazer:** renderizar confirmação, resultado liberado e eleição encerrada.
**Testes (escrever antes):** cada fase mostra somente os dados presentes no DTO.
**Pronto quando:** telas finais não calculam nem inferem contagens.
**Arquivos:** `apps/web/src/features/voter/`.
**Commit sugerido:** `feat(web): adiciona fases finais da tela do eleitor`

### [ ] C9.b — Reconexão e estado stale
**Ref.:** architecture §7.
**Depende de:** C9.a.
**Fazer:** buscar `GET /voter/state` em remount/reconexão e impedir resultado stale mais antigo.
**Testes (escrever antes):** reconexão chama API; socket mais novo prevalece.
**Pronto quando:** reconectar restaura a fase real da votação.
**Arquivos:** `apps/web/src/features/voter/useVoterSession.ts`.
**Commit sugerido:** `fix(web): ressincroniza o eleitor após reconexão`

### [ ] C10.a — Login e identidade do admin
**Ref.:** architecture §6.1.
**Depende de:** C3.b.
**Fazer:** criar `/admin/login`, armazenar token e consultar `/admin/me`.
**Testes (escrever antes):** credenciais válidas/ inválidas; dados do `/me`.
**Pronto quando:** um admin autenticado pode manter sua identidade na sessão.
**Arquivos:** `apps/web/src/features/admin/auth/`.
**Commit sugerido:** `feat(web): adiciona login e identidade do admin`

### [ ] C10.b — Rotas protegidas e logout
**Ref.:** architecture §9.
**Depende de:** C10.a.
**Fazer:** proteger `/admin` e rotas de eleição; rejeitar token ausente, inválido ou de outro papel.
**Testes (escrever antes):** sem token redireciona; papel errado bloqueia; logout limpa acesso.
**Pronto quando:** todas as áreas administrativas usam uma proteção única.
**Arquivos:** `apps/web/src/features/admin/auth/`, `App.tsx`.
**Commit sugerido:** `feat(web): protege as rotas administrativas`

### [ ] C11.a — Lista de eleições
**Ref.:** architecture §6.1.
**Depende de:** C10.b.
**Fazer:** criar `/admin` com `ElectionSummaryDTO`, estados e contagens.
**Testes (escrever antes):** resposta vazia; itens mostram nome, status, cargos e eleitores.
**Pronto quando:** admin visualiza suas eleições.
**Arquivos:** `apps/web/src/features/admin/elections/`.
**Commit sugerido:** `feat(web): lista eleições do administrador`

### [ ] C11.b — Criação de eleição
**Ref.:** architecture §6.1.
**Depende de:** C11.a.
**Fazer:** criar formulário com nome e prazo padrão válido; navegar para configuração criada.
**Testes (escrever antes):** nome vazio; prazo 4/3601/fracionário; criação válida.
**Pronto quando:** eleição criada aparece no fluxo de configuração.
**Arquivos:** `apps/web/src/features/admin/elections/`.
**Commit sugerido:** `feat(web): cria eleições pela interface`

### [ ] C12.a — Criar e editar cargos
**Ref.:** architecture §6.1 e §5.3.
**Depende de:** C11.b.
**Fazer:** criar aba Cargos com título e desempate; atualizar cargo via DTO completo.
**Testes (escrever antes):** criar no fim da fila; título vazio; editar regra/título.
**Pronto quando:** cargos são criados/editados sem recarregar estado manualmente.
**Arquivos:** `apps/web/src/features/admin/config/`.
**Commit sugerido:** `feat(web): cria e edita cargos da eleição`

### [ ] C12.b — Remover cargos
**Ref.:** architecture §6.1.
**Depende de:** C12.a.
**Fazer:** confirmar remoção e respeitar estados retornados pela API.
**Testes (escrever antes):** removido some da lista; erro de estado inválido é exibido.
**Pronto quando:** remoção usa confirmação acessível e estado real do servidor.
**Arquivos:** `apps/web/src/features/admin/config/`.
**Commit sugerido:** `feat(web): remove cargos com confirmação`

### [ ] C13.a — Criar candidato
**Ref.:** architecture §6.1 e §5.4.
**Depende de:** C12.b.
**Fazer:** criar formulário de candidato com candidaturas e primeira opção.
**Testes (escrever antes):** limites de idade; candidaturas vazias; primeira opção fora das candidaturas.
**Pronto quando:** candidato válido é criado e aparece nas opções dos cargos.
**Arquivos:** `apps/web/src/features/admin/config/`.
**Commit sugerido:** `feat(web): cria candidatos e suas candidaturas`

### [ ] C13.b — Editar e remover candidato
**Ref.:** architecture §6.1.
**Depende de:** C13.a.
**Fazer:** permitir edição/removal e bloquear candidato eleito pela resposta da API.
**Testes (escrever antes):** editar primeira opção; remover candidato; eleito gera erro.
**Pronto quando:** ações de candidato usam o agregado completo recebido do servidor.
**Arquivos:** `apps/web/src/features/admin/config/`.
**Commit sugerido:** `feat(web): edita e remove candidatos`

### [ ] C14.a — Gestão de eleitores
**Ref.:** architecture §6.1.
**Depende de:** C13.b.
**Fazer:** gerar 1–500 códigos, mostrar rótulos/códigos, copiar e revogar.
**Testes (escrever antes):** count 0/501; rótulos; revogação altera status.
**Pronto quando:** admin credencia eleitores sem inferir códigos.
**Arquivos:** `apps/web/src/features/admin/config/VotersTab.tsx`.
**Commit sugerido:** `feat(web): gerencia códigos de eleitores`

### [ ] C14.b — Ordem da fila
**Ref.:** architecture §6.1.
**Depende de:** C14.a.
**Fazer:** criar abas com ↑↓, buscar sugestão e confirmar antes de aplicar a fila.
**Testes (escrever antes):** mover cargos; sugestão difere até confirmar; aplicar fila.
**Pronto quando:** ordem proposta e aplicada ficam distintas até confirmação.
**Arquivos:** `apps/web/src/features/admin/config/QueueTab.tsx`.
**Commit sugerido:** `feat(web): permite ordenar e sugerir cargos`

### [ ] C15.a — Estado ao vivo via socket
**Ref.:** architecture §6.1 e §7.
**Depende de:** C4.b, C11.b.
**Fazer:** criar `useAdminElection`, obter estado REST e observar `admin:state`.
**Testes (escrever antes):** estado inicial; socket substitui estado; watch reconecta.
**Pronto quando:** painel não mantém snapshot próprio divergente do servidor.
**Arquivos:** `apps/web/src/features/admin/live/useAdminElection.ts`.
**Commit sugerido:** `feat(web): sincroniza o painel ao vivo do admin`

### [ ] C15.b — Controles de abertura e fechamento
**Ref.:** architecture §6.1.
**Depende de:** C15.a, C14.b.
**Fazer:** mostrar próximo cargo, abrir rodada, progresso, deadline e fechar antes.
**Testes (escrever antes):** READY; ROUND_IN_PROGRESS; abertura; deadline; fechamento.
**Pronto quando:** todas as ações usam as rotas corretas e o DTO atual.
**Arquivos:** `apps/web/src/features/admin/live/`.
**Commit sugerido:** `feat(web): adiciona controles da rodada ao vivo`

### [ ] C16.a — Resultado e resolução da rodada
**Ref.:** architecture §5.4 e §6.1.
**Depende de:** C15.b.
**Fazer:** mostrar resultado, abrir 2º turno, liberar, desfazer e anular.
**Testes (escrever antes):** ELECTED, RUNOFF_REQUIRED, NO_VALID_VOTES e ações disponíveis.
**Pronto quando:** a resolução usa status e DTO do servidor sem cálculos locais.
**Arquivos:** `apps/web/src/features/admin/live/`.
**Commit sugerido:** `feat(web): resolve resultados e segundo turno no painel`

### [ ] C16.b — Candidatos insuficientes
**Ref.:** architecture §5.4.
**Depende de:** C16.a, C6.a.
**Fazer:** anexar candidato, adiar e cancelar com dupla confirmação e `confirmTitle`.
**Testes (escrever antes):** anexar; adiar; cancelar nome vazio/diferente/exato.
**Pronto quando:** todas as opções aparecem somente para `INSUFFICIENT_CANDIDATES`.
**Arquivos:** `apps/web/src/features/admin/live/`.
**Commit sugerido:** `feat(web): adiciona ações para candidatos insuficientes`

### [ ] C17.a — Configuração Playwright
**Ref.:** architecture §10.2 e §14.
**Depende de:** marco M2.
**Fazer:** criar `playwright.config.ts`, Chromium, base URL e `webServer` com servidor real em memória.
**Testes (escrever antes):** smoke sobe o servidor e encontra a página.
**Pronto quando:** Playwright inicia o app real sem configuração manual.
**Arquivos:** `e2e/playwright.config.ts`.
**Commit sugerido:** `test(e2e): configura Playwright com servidor real`

### [ ] C17.b — Fixtures Playwright
**Ref.:** architecture §10.2.
**Depende de:** C17.a.
**Fazer:** criar fixtures de admin, eleição pronta, códigos e contexto limpo.
**Testes (escrever antes):** fixture autentica; contexto novo não herda sessão.
**Pronto quando:** specs podem montar dados pela API sem duplicação.
**Arquivos:** `e2e/fixtures/`.
**Commit sugerido:** `test(e2e): adiciona fixtures de API e autenticação`

### [ ] C18 — E2E de configuração pelo admin
**Ref.:** architecture §10.2 cenário 1.
**Depende de:** C17.b, C10–C14.
**Fazer:** criar login, eleição, cargo, candidatos, códigos e abrir eleição pela UI.
**Testes (escrever antes):** jornada completa; ausência de cargo/candidato não abre indevidamente.
**Pronto quando:** spec termina com eleição aberta.
**Arquivos:** `e2e/specs/admin-configures-election.spec.ts`.
**Commit sugerido:** `test(e2e): cobre configuração completa pela interface`

### [ ] C19.a — Contextos e votos dos eleitores
**Ref.:** architecture §10.2 cenário 2.
**Depende de:** C17.b, C18.
**Fazer:** preparar três contextos, fazer login por código e abrir a cédula em cada um.
**Testes (escrever antes):** três eleitores veem a cédula; votos válido/branco são aceitos uma vez.
**Pronto quando:** os três votos podem ser enviados ao servidor real.
**Arquivos:** `e2e/specs/full-position.spec.ts`.
**Commit sugerido:** `test(e2e): cobre entrada e voto de três eleitores`

### [ ] C19.b — Fechamento e liberação do resultado
**Ref.:** architecture §10.2 cenário 2.
**Depende de:** C19.a, C15–C16.
**Fazer:** verificar fechamento após todos votarem, resultado privado antes da liberação e público depois.
**Testes (escrever antes):** fechamento automático; liberado só pelo admin.
**Pronto quando:** a spec cobre a jornada completa de um cargo.
**Arquivos:** `e2e/specs/full-position.spec.ts`.
**Commit sugerido:** `test(e2e): cobre fechamento e liberação de resultado`

### [ ] C20.a — Cenário de segundo turno
**Ref.:** architecture §10.2 cenário 3.
**Depende de:** C19.b.
**Fazer:** preparar três candidatos e votos que deixam a posição em `AWAITING_RUNOFF`.
**Testes (escrever antes):** posição aguarda runoff; exatamente dois finalistas estão disponíveis.
**Pronto quando:** cenário cria estado válido de 2º turno.
**Arquivos:** `e2e/specs/runoff.spec.ts`.
**Commit sugerido:** `test(e2e): prepara cenário de segundo turno`

### [ ] C20.b — Abrir segundo turno e verificar vencedor
**Ref.:** architecture §10.2 cenário 3.
**Depende de:** C20.a.
**Fazer:** abrir 2º turno pela UI e verificar a decisão do cargo.
**Testes (escrever antes):** vencedor eleito; finalistas são os únicos candidatos.
**Pronto quando:** runoff completo passa no servidor real.
**Arquivos:** `e2e/specs/runoff.spec.ts`.
**Commit sugerido:** `test(e2e): cobre abertura e resultado do segundo turno`

### [ ] C21.a — Exclusão do eleito
**Ref.:** architecture §10.2 cenário 4.
**Depende de:** C20.b.
**Fazer:** eleger candidato no cargo A e verificar que ele não aparece na cédula do cargo B.
**Testes (escrever antes):** eleito ausente; demais candidatos aptos presentes.
**Pronto quando:** elegibilidade entre cargos fica coberta pela UI.
**Arquivos:** `e2e/specs/elected-exclusion.spec.ts`.
**Commit sugerido:** `test(e2e): cobre exclusão de eleito no cargo seguinte`

### [ ] C21.b — Cargo sem candidatos
**Ref.:** architecture §10.2 cenário 4.
**Depende de:** C21.a.
**Fazer:** verificar anexar existente, adiar e cancelar pela UI com confirmação dupla.
**Testes (escrever antes):** anexar, adiar e cancelamento confirmado.
**Pronto quando:** todas as ações de insuficiência passam no e2e.
**Arquivos:** `e2e/specs/elected-exclusion.spec.ts`.
**Commit sugerido:** `test(e2e): cobre cargos sem candidatos suficientes`

### [ ] C22.a — E2E de desfazer
**Ref.:** architecture §10.2 cenário 5.
**Depende de:** C21.b.
**Fazer:** liberar resultado e desfazer pela UI, verificando o estado anterior.
**Testes (escrever antes):** undo restaurado; nada a desfazer mostra erro.
**Pronto quando:** resiliência de desfazer fica coberta sem sleep.
**Arquivos:** `e2e/specs/resilience.spec.ts`.
**Commit sugerido:** `test(e2e): cobre desfazer resultado pela interface`

### [ ] C22.b — Código inválido e integração no CI
**Ref.:** architecture §10.2 cenário 5.
**Depende de:** C22.a.
**Fazer:** cobrir código inválido e coordenar com B o passo Playwright no CI dos três SOs.
**Testes (escrever antes):** mensagem inválida; nenhum e2e usa waitForTimeout.
**Pronto quando:** existem pelo menos cinco specs estáveis e o CI foi preparado por B.
**Arquivos:** `e2e/specs/resilience.spec.ts`, `.github/workflows/ci.yml` somente via coordenação.
**Commit sugerido:** `test(e2e): cobre código inválido e prepara execução no CI`

### [ ] C23.a — Acessibilidade semântica
**Ref.:** architecture §9.
**Depende de:** C6; pode começar antes de C16.
**Fazer:** revisar headings, labels, roles, foco, diálogos e mensagens.
**Testes (escrever antes):** elementos principais por role/label; diálogo recebe foco; ação cancelável.
**Pronto quando:** teclado e leitores podem operar o fluxo principal.
**Arquivos:** `apps/web/src/`, `apps/web/test/`.
**Commit sugerido:** `fix(web): melhora semântica e acessibilidade da interface`

### [ ] C23.b — Layout responsivo móvel
**Ref.:** architecture §9.
**Depende de:** C23.a e C16.
**Fazer:** validar `/`, `/votar` e ações ao vivo em largura estreita; preservar ações críticas visíveis.
**Testes (escrever antes):** largura estreita não oculta controles; estados vazios mostram mensagem.
**Pronto quando:** fluxo do celular funciona sem overflow ou ações dependentes de cor.
**Arquivos:** CSS/estilos em `apps/web/src/`.
**Commit sugerido:** `style(web): melhora layout responsivo móvel`

### [ ] C24.a — Revisão de smells no front
**Ref.:** CLAUDE.md.
**Depende de:** C2–C23.
**Fazer:** revisar `apps/web/test`, remover smells e manter AAA/nomes em inglês.
**Testes (escrever antes):** nenhum `.skip`, `.only`, sleep ou fixture geral novo.
**Pronto quando:** suíte do front usa comportamentos observáveis e fakes nas fronteiras.
**Arquivos:** `apps/web/test/`, possíveis refatorações em `apps/web/src/`.
**Commit sugerido:** `test(web): remove smells e estabiliza componentes`

### [ ] C24.b — Revisão de smells nos e2e
**Ref.:** CLAUDE.md e architecture §10.
**Depende de:** C24.a.
**Fazer:** revisar locators, remover waits e confirmar cobertura web mínima de 80%.
**Testes (escrever antes):** nenhum `waitForTimeout`; role/label preferidos; cobertura verde.
**Pronto quando:** e2e e componente passam sem testes frágeis ou ignorados.
**Arquivos:** `e2e/specs/`, relatórios de cobertura.
**Commit sugerido:** `test(e2e): estabiliza cenários e cobertura final`

---

## Decisões e desvios

- Nenhum módulo deve importar `@voto/domain` ou `@voto/server`. O único contrato de pacote
  permitido para C é `@voto/shared`.
- O servidor é fonte da verdade: o front substitui estados de socket/REST e não recalcula apuração
  ou elegibilidade.
- Até o M2, o backend é representado por MSW e socket fake.
- C2–C16 são de componente/unidade; C17–C22 são e2e; C23 pode avançar antes do M2.
- A criação de novos arquivos em `.github/workflows/` não é permitida sem B.
- Qualquer desvio do contrato da API ou DTO precisa ser registrado em `todo-frontend.md` e aprovado
  pelo grupo antes da implementação.

## Pendências dependentes de outros integrantes

- C17–C22 dependem de B17–B21 para o servidor real em memória/deploy.
- C22 depende de B para integrar o Playwright ao `.github/workflows/ci.yml`.
- C não altera `packages/shared`; mudanças são solicitadas a B em PR próprio.
