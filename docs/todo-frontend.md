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
   *Notas do agente*. A partir da C2, nenhuma tarefa C está concluída.
2. **Execute apenas a próxima tarefa `[ ]`** da lista, exceto quando o usuário indicar outra.
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
8. Só declare conclusão depois de rodar, no repositório inteiro, `npm run lint`,
   `npm run typecheck` e `npm run test:coverage`.

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

---

## Mapa rápido do código

> Atualizar esta seção quando cada tarefa criar módulos novos.

- `apps/web/src/App.tsx` → tabela atual de rotas do frontend; hoje só contém `/`.
- `apps/web/src/main.tsx` → composição do `BrowserRouter` e da árvore React; objeto humilde,
  excluído da cobertura.
- `apps/web/vite.config.ts` → proxy `/api` e `/socket.io` para `localhost:3000`.
- `apps/web/test/setup.ts` → jest-dom e cleanup do Testing Library.
- `apps/web/test/App.test.tsx` → teste de fumaça do esqueleto atual.
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

---

## Tarefas

### [ ] C2 — Infraestrutura de testes com MSW
**Ref.:** architecture §6, §10.1; `divisao-tarefas.md` §5.
**Depende de:** S0.5 concluído; S0.3b concluído.
**Fazer:**
- Criar handlers MSW que implementem as rotas REST necessárias ao desenvolvimento C7–C16, com
  estado em memória isolado por servidor de teste.
- Criar helpers de `renderWithProviders` para `MemoryRouter`, contexto de autenticação e socket,
  sem estado global entre testes.
- Criar fábricas de `AdminElectionDTO`, `VoterStateDTO`, `ElectionSummaryDTO`,
  `RoundView`, `RoundResultDTO` e `ErrorDTO`.
- Implementar respostas coerentes de sucesso, 400, 401, 403, 404, 409 e 410.
**Testes (escrever antes):**
- um handler válido devolve JSON do contrato;
- o helper aplica o estado inicial sem vazamento entre testes;
- fábricas permitem sobrescrever somente os campos relevantes.
**Pronto quando:** os testes do front podem fazer chamadas REST sem rede real e resetar o estado
entre casos.
**Arquivos esperados:** `apps/web/test/msw/`, `apps/web/test/utils/`.

### [ ] C3 — Cliente REST tipado
**Ref.:** architecture §6.1–§6.3.
**Depende de:** C2; schemas e DTOs de `@voto/shared`.
**Fazer:**
- Criar `api-client.ts` com `fetch` tipado, prefixo `/api` e token Bearer opcional.
- Ler `ErrorDTO` em respostas não 2xx e lançar um erro HTTP tipado usado pela UI.
- Cobrir os métodos usados pelas telas sem expor detalhes de `fetch` aos componentes.
**Testes (escrever antes):**
- GET adiciona Authorization quando há token;
- POST serializa o body esperado;
- erro JSON vira código e mensagem do `ErrorDTO`;
- resposta não JSON/sem corpo gera erro controlado;
- 204 não tenta interpretar JSON.
**Pronto quando:** todas as chamadas conhecidas usam o mesmo cliente e não há `fetch` espalhado em
componentes.
**Arquivos esperados:** `apps/web/src/api/api-client.ts`.

### [ ] C4 — Cliente e provedor de Socket.IO
**Ref.:** architecture §7; `SOCKET_EVENTS`.
**Depende de:** C2; C3 pode ser paralelo.
**Fazer:**
- Criar a interface do socket, `socket-client.ts`, `SocketProvider` injetável e
  `createFakeSocket()` para testes.
- Usar `SOCKET_EVENTS.ADMIN_STATE`, `VOTER_STATE` e `ADMIN_WATCH`.
- O provedor deve permitir substituir o cliente real por fake sem importar implementação concreta
  nos componentes.
**Testes (escrever antes):**
- conecta com o token no `auth`;
- ouve `admin:state` e `voter:state`;
- `admin:watch` envia o `electionId`;
- desconexão limpa listeners;
- componente consumidor recebe estado completo substituindo o anterior.
**Pronto quando:** hooks e telas dependem apenas do provedor, nunca de `socket.io-client` diretamente.
**Arquivos esperados:** `apps/web/src/api/socket-client.ts`, `apps/web/test/fakes/`.

### [ ] C5 — Funções puras de tempo e apresentação
**Ref.:** architecture §5.4 (desempate), §8.3 (serverNow).
**Depende de:** contratos de `@voto/shared`; pode começar em paralelo a C2–C4.
**Fazer:**
- Implementar contagem regressiva corrigida pela diferença entre o relógio do servidor e do cliente.
- Implementar porcentagens sobre votos válidos e rótulos em português.
- Implementar rótulos das regras `YOUNGEST`, `OLDEST` e `MOST_REMAINING_TIME`.
- Usar deadline ISO como entrada e evitar `Date.now()` dentro de regras testáveis.
**Testes (escrever antes):**
- prazo futuro, limite exato, prazo vencido e relógios fora de sincronismo;
- 0 votos válidos não divide por zero;
- porcentagens arredondadas conforme o formato escolhido;
- três rótulos de desempate.
**Pronto quando:** countdown e formatação são puros, determinísticos e reutilizáveis.
**Arquivos esperados:** `apps/web/src/lib/`.

### [ ] C6 — Componentes base
**Ref.:** architecture §9.
**Depende de:** C2; C5 para countdown.
**Fazer:**
- Criar `ConfirmDialog`, `DoubleConfirmDialog`, `Countdown` e `ErrorMessage`.
- `DoubleConfirmDialog` deve exigir o título exato do cargo no segundo passo.
- Usar elementos acessíveis e callbacks explícitos; não ocultar regras de negócio fora do domínio.
**Testes (escrever antes):**
- confirmar/cancelar em um clique;
- segundo passo não confirma com nome vazio ou diferente;
- nome exato confirma;
- countdown mostra prazo, vencimento e atualização;
- `ErrorMessage` mostra código e mensagem sem vazar conteúdo técnico.
**Pronto quando:** componentes são acessíveis e testados pelo role/label.
**Arquivos esperados:** `apps/web/src/components/`.

### [ ] C7 — Entrada do eleitor
**Ref.:** architecture §6.2 (`POST /voter/session`), §9 rota `/`.
**Depende de:** C2, C3.
**Fazer:**
- Substituir a página provisória `/` por formulário com código e botão "Entrar".
- Armazenar token/identidade necessários à navegação sem implementar regras de segurança no front.
- Mostrar `INVALID_CODE` como código inválido e `VOTER_REVOKED` como código revogado.
- Em sucesso, navegar para `/votar`.
**Testes (escrever antes):**
- código válido inicia a sessão;
- código vazio não chama a API ou mostra validação;
- `INVALID_CODE` mostra mensagem de código inválido;
- `VOTER_REVOKED` mostra mensagem de revogado;
- erro de rede mostra mensagem reutilizável.
**Pronto quando:** `/` está pronta para uso pelo celular e falha pelos estados definidos pelo backend.
**Arquivos esperados:** `apps/web/src/features/voter/`.

### [ ] C8 — Sessão e cédula do eleitor
**Ref.:** architecture §6.2 e §7 (`VoterStateDTO`, `VOTER_STATE`).
**Depende de:** C4, C5, C7.
**Fazer:**
- Criar `useVoterSession`, que consulta estado inicial e reage a `voter:state`.
- Renderizar as fases `WAITING` e `VOTING`.
- `VOTING` mostra cargo, candidatos, voto branco e countdown usando `serverNow`.
- Postar voto em `POST /api/voter/votes` sem passar pelo socket.
**Testes (escrever antes):**
- fase WAITING mostra espera;
- fase VOTING lista a cédula e o deadline;
- votar em candidato chama a API com round/candidate;
- votar em branco usa `BLANK`;
- `VOTER_ALREADY_VOTED` não permite ação duplicada;
- `ROUND_EXPIRED` exibe prazo expirado.
**Pronto quando:** o eleitor consegue aguardar, votar em candidato ou branco e receber estados em tempo real.
**Arquivos esperados:** `apps/web/src/features/voter/`, hook e tela de `/votar`.

### [ ] C9 — Fases finais e reconexão do eleitor
**Ref.:** architecture §6.2, §7 (`VOTED`, `RESULTS`, `FINISHED`).
**Depende de:** C8.
**Fazer:**
- Renderizar `VOTED`, `RESULTS` e `FINISHED`.
- Ao reconectar ou remontar, buscar `GET /api/voter/state` e substituir o estado pelo servidor.
- Não inferir ou manter contagem parcial antes de a API liberar o resultado.
**Testes (escrever antes):**
- VOTED mostra confirmação;
- RESULTS mostra contagem, brancos e desfecho;
- FINISHED encerra a sessão;
- reconexão chama o estado atual;
- resposta stale não sobrescreve um estado mais novo recebido pelo socket.
**Pronto quando:** as fases finais são fielmente renderizadas e reconexão não perde estado.
**Arquivos esperados:** `apps/web/src/features/voter/`.

### [ ] C10 — Autenticação do admin
**Ref.:** architecture §6.1 (`/admin/login`, `/admin/me`), §9.
**Depende de:** C2, C3.
**Fazer:**
- Criar login em `/admin/login`, armazenamento do token e busca de `/admin/me`.
- Criar proteção de rotas `/admin` e `/admin/eleicoes/:id/*`.
- Token ausente ou inválido retorna ao login; usuário de papel eleitor é bloqueado.
**Testes (escrever antes):**
- credenciais válidas armazenam token e entram;
- credenciais inválidas mostram erro;
- `/admin/me` sem token redireciona;
- token de eleitor é rejeitado;
- logout remove o acesso protegido.
**Pronto quando:** todas as rotas administrativas exigem o fluxo de autenticação.
**Arquivos esperados:** `apps/web/src/features/admin/auth/`.

### [ ] C11 — Lista e criação de eleições
**Ref.:** architecture §6.1 (`GET/POST /elections`), §9.
**Depende de:** C10.
**Fazer:**
- Criar `/admin` com lista de `ElectionSummaryDTO`.
- Mostrar nome, estado, quantidade de cargos e eleitores.
- Criar eleição pelo nome e prazo padrão opcional, validando 5–3600 segundos.
- Navegar para configuração da eleição criada.
**Testes (escrever antes):**
- lista mostra apenas os dados presentes na resposta;
- criação válida adiciona/navega para a eleição;
- nome vazio é bloqueado;
- prazo 4/3601/fracionário é bloqueado;
- 403/404/409 usa `ErrorMessage`.
**Pronto quando:** admin consegue listar e criar uma eleição pela UI.
**Arquivos esperados:** `apps/web/src/features/admin/elections/`.

### [ ] C12 — Configuração de cargos
**Ref.:** architecture §6.1 (`positions`), §5.3.
**Depende de:** C11.
**Fazer:**
- Criar a aba Cargos com criar, editar e remover apenas em estados permitidos pela API.
- Formulário usa título e enum de desempate.
- Recarregar o estado completo a partir da resposta `AdminElectionDTO`.
**Testes (escrever antes):**
- criar cargo aparece na fila;
- título vazio é bloqueado;
- editar título e desempate mantém os demais dados;
- remover cargo sem candidatos é confirmado;
- erro de cargo em estado inválido mostra a mensagem.
**Pronto quando:** configuração de cargos usa o estado do servidor como fonte da verdade.
**Arquivos esperados:** `apps/web/src/features/admin/config/`.

### [ ] C13 — Configuração de candidatos
**Ref.:** architecture §6.1 (`candidates`), §5.4.
**Depende de:** C12.
**Fazer:**
- Criar a aba Candidatos com nome, idade, meses restantes, candidaturas e primeira opção.
- Permitir editar/remover candidato e verificar que a primeira opção pertence às candidaturas.
- Marcar visualmente os cargos marcados em cada candidatura.
**Testes (escrever antes):**
- cria candidato válido;
- idade 16/120 aceita e limites fora rejeitam;
- candidaturas vazias são bloqueadas;
- primeira opção fora das candidaturas é bloqueada;
- editar/remover candidato usa a resposta completa da API;
- candidato eleito não pode ser removido/mostra erro.
**Pronto quando:** a configuração representa candidaturas e primeira opção sem divergência do domínio.
**Arquivos esperados:** `apps/web/src/features/admin/config/`.

### [ ] C14 — Eleitores e ordem da fila
**Ref.:** architecture §6.1 (`voters`, `queue`, `queue/suggestion`).
**Depende de:** C13.
**Fazer:**
- Criar aba Eleitores: gerar de 1–500 códigos, rótulos opcionais, listar, copiar e revogar.
- Mostrar somente os códigos da resposta da geração; não inferir outros códigos.
- Criar aba Ordem com botões ↑↓ e sugestão.
- `Sugerir ordem` exige confirmação antes de aplicar `PUT /queue`.
**Testes (escrever antes):**
- gera quantidade válida e mostra os códigos;
- count 0/501 é bloqueado;
- rótulo opcional é enviado;
- revogar muda o status de `CREDENTIALED` para `REVOKED`;
- ↑/↓ altera a ordem proposta;
- sugestão difere da atual até o usuário confirmar.
**Pronto quando:** admins conseguem credenciar eleitores e confirmar uma ordem de votação.
**Arquivos esperados:** `apps/web/src/features/admin/config/`.

### [ ] C15 — Painel ao vivo e estado via socket
**Ref.:** architecture §6.1, §7, §8.2.
**Depende de:** C4, C11, C14.
**Fazer:**
- Criar `useAdminElection`, que obtém `GET /elections/:id` e depois observa `admin:state`.
- Renderizar próximo cargo, abrir 1º turno/rodada, progresso x/y, prazo e fechar antes.
- Em reconnect, emitir `admin:watch` e buscar o estado completo novamente.
**Testes (escrever antes):**
- READY mostra cargo e ação de abrir;
- ROUND_IN_PROGRESS mostra progresso sem contagem parcial;
- abertura envia cargo e duração opcional;
- deadline usa `serverNow`;
- fechar antes chama a rota correta;
- socket substitui o estado pelo DTO recebido.
**Pronto quando:** o painel ao vivo não mantém estado próprio divergente do servidor.
**Arquivos esperados:** `apps/web/src/features/admin/live/`.

### [ ] C16 — Resultados e candidatos insuficientes
**Ref.:** architecture §5.4, §6.1, §9.
**Depende de:** C15; C6.
**Fazer:**
- Mostrar resultado da última rodada, abrir 2º turno, liberar resultado, desfazer e anular.
- Mostrar painel de candidatos insuficientes: anexar existente, criar novo, adiar e cancelar.
- Cancelamento usa `DoubleConfirmDialog` no front e envia `confirmTitle`.
- Desabilitar ações que não correspondem ao `next.status`.
**Testes (escrever antes):**
- resultado eleito mostra o candidato;
- RUNOFF_REQUIRED oferece abrir 2º turno;
- NO_VALID_VOTES mostra o desfecho;
- liberar/anular/undo usam as rotas corretas;
- anexar candidato atualiza o estado;
- adiar não pede título; cancelar exige título exato;
- desfazer sem histórico é rejeitado pela API/UI.
**Pronto quando:** todas as ações de resolução usam o DTO completo e não calculam eleições no front.
**Arquivos esperados:** `apps/web/src/features/admin/live/`.

### [ ] C17 — Infraestrutura Playwright
**Ref.:** architecture §10.2, §14.
**Depende de:** marco M2 (`REPOSITORY=memory`, servidor real integrado).
**Fazer enquanto o M2 não chega:**
- Planejar fixtures e não criar testes contra servidores fictícios permanentes.
- Ao chegar o M2, criar `e2e/playwright.config.ts` com `webServer` que sobe o servidor real,
  Chromium e base URL.
- Criar fixtures de login admin, eleição pronta e códigos pela API.
- Configurar a pasta `e2e/specs`.
- Não editar `.github/workflows/ci.yml`; a ativação no CI depende de B.
**Testes (escrever antes):**
- smoke de conexão da configuração;
- fixtures autenticam e retornam dados válidos;
- contexto novo começa sem sessão de admin.
**Pronto quando:** os testes podem subir o servidor real em memória e criar dados pelo backend.
**Arquivos esperados:** `e2e/playwright.config.ts`, `e2e/fixtures/`.

### [ ] C18 — E2E de configuração pelo admin
**Ref.:** architecture §10.2 cenário 1.
**Depende de:** C17, C10–C14.
**Fazer:**
- Criar um único e2e que faz login, cria eleição, cria cargo, cria candidatos, gera códigos e abre
  a eleição pela UI.
**Testes (escrever antes):**
- jornada completa termina em eleição aberta;
- ausência de candidato/cargo não abre eleição conforme o backend.
**Pronto quando:** C18 cobre a jornada crítica de configuração.
**Arquivos esperados:** `e2e/specs/admin-configures-election.spec.ts`.

### [ ] C19 — E2E de fluxo completo de um cargo
**Ref.:** architecture §10.2 cenário 2.
**Depende de:** C17, C18; C8–C9 e C15–C16.
**Fazer:**
- Abrir 3 contextos separados de navegador para 3 eleitores.
- Admin abre rodada, eleitores entram e votam, o sistema fecha a rodada ao atingir todos,
  admin libera o resultado e eleitores recebem `RESULTS`.
**Testes (escrever antes):**
- 3 eleitores veem a cédula;
- votos são aceitos uma vez;
- fechamento ocorre após os 3 votos;
- resultado só aparece após liberação;
- não é necessário sleep; usar expectativas do Playwright.
**Pronto quando:** a jornada completa de um cargo passa com o servidor real.
**Arquivos esperados:** `e2e/specs/full-position.spec.ts`.

### [ ] C20 — E2E de segundo turno
**Ref.:** architecture §10.2 cenário 3.
**Depende de:** C19.
**Fazer:**
- Configurar 3 candidatos e votos que exigem 2º turno.
- Admin abre o 2º turno com os finalistas e registra o vencedor.
**Testes (escrever antes):**
- posição fica `AWAITING_RUNOFF`;
- 2º turno contém exatamente os 2 finalistas;
- vencedor fica decidido após o 2º turno.
**Pronto quando:** C20 cobre 1º turno sem maioria e 2º turno real.
**Arquivos esperados:** `e2e/specs/runoff.spec.ts`.

### [ ] C21 — E2E de elegibilidade e cargo sem candidatos
**Ref.:** architecture §10.2 cenário 4.
**Depende de:** C20.
**Fazer:**
- Fazer candidato eleito no cargo A e verificar que ele não aparece no cargo seguinte.
- Montar cargo sem candidatos e testar anexar, adiar e cancelar pela UI.
**Testes (escrever antes):**
- eleito não é elegível no cargo seguinte;
- cargo sem aptos oferece os candidatos anexáveis;
- adiar mantém o cargo no fluxo adequado;
- cancelar requer confirmação dupla.
**Pronto quando:** C21 cobre exclusão de eleito e estados de candidatos insuficientes.
**Arquivos esperados:** `e2e/specs/elected-exclusion.spec.ts`.

### [ ] C22 — E2E de resiliência e integração no CI
**Ref:** architecture §10.2 cenário 5.
**Depende de:** C21; C17.
**Fazer:**
- Criar e2e em que admin desfaz liberação/resultado e o estado volta ao anterior.
- Criar e2e ou caso de login inválido do eleitor com código inexistente.
- Validar o total mínimo de 5 specs antes de chamar C22 concluída.
- Coordenar com B para adicionar o passo Playwright no CI dos 3 SOs.
**Testes (escrever antes):**
- undo restaura o estado anterior;
- código inválido mostra mensagem;
- nenhum e2e depende de tempo real/sleep.
**Pronto quando:** os ≥5 e2e passam localmente e a execução nos 3 SOs é assumida pelo CI combinado.
**Arquivos esperados:** `e2e/specs/resilience.spec.ts`, `e2e/`.

### [ ] C23 — Acessibilidade e polimento responsivo
**Ref.:** architecture §9.
**Depende de:** pode começar após C6; finalizar após C16.
**Fazer:**
- Revisar labels, roles, foco, mensagens, navegação por teclado e estados vazios.
- Garantir layout funcional em celular, especialmente `/`, `/votar` e botões de voto.
- Evitar layout que esconda ações críticas ou dependam apenas de cor.
**Testes (escrever antes):**
- telas principais têm heading e labels encontrados por role/label;
- botões de ação têm nomes visíveis;
- dialogs recebem foco e podem ser cancelados;
- layout não quebra com largura estreita;
- mensagens de erro são claras.
**Pronto quando:** a navegação principal é acessível por teclado e utilizável no celular.
**Arquivos esperados:** componentes e páginas em `apps/web/src/`.

### [ ] C24 — Revisão de test smells
**Ref.:** CLAUDE.md; architecture §10.
**Depende de:** C2–C23.
**Fazer:**
- Revisar testes de front e e2e; remover Conditional Test Logic, Assertion Roulette, Magic Numbers,
  General Fixture, Mystery Guest, Sleepy Test e testes ignorados.
- Garantir AAA separado por linha, nomes de comportamento em inglês e uma asserção lógica por
  cenário.
- Substituir sleeps por fake timers no Vitest e expectativas/locators do Playwright.
- Usar role/label nos RTL e nos e2e; usar `data-testid` apenas sem alternativa.
- Confirmar que a suíte web mede pelo menos 80% em linhas, branches, funções e statements.
**Testes (escrever antes):**
- não há `.skip`, `.only`, `waitForTimeout`, `setTimeout`/`sleep` ou seletores frágeis novos;
- a cobertura do web fica acima do limite.
**Pronto quando:** a revisão elimina smells e a suíte final permanece verde.
**Arquivos esperados:** `apps/web/test/`, `e2e/specs/`, possíveis refatorações em
`apps/web/src/`.

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
