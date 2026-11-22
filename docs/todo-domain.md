# TO-DO — Integrante A (Domínio: regras da eleição)

Este arquivo é a **memória de trabalho do agente de IA** da parte A. Ele lista, em ordem, tudo o que precisa existir para o `packages/domain` ficar implementado e testado, e registra, tarefa a tarefa, o que já foi feito.

Documentos de referência (leia as seções citadas em cada tarefa):
- [architecture.md](architecture.md): §5 (modelo de domínio, regras e ambiguidades), §10 (testes).
- [divisao-tarefas.md](divisao-tarefas.md): §3 (tarefas de A) e regras de convivência.
- `CLAUDE.md` (raiz): como codar (TDD, convenções). Tem prioridade sobre este arquivo em caso de conflito.

---

## Como o agente usa este arquivo

1. **Antes de qualquer coisa**, leia este arquivo inteiro: as tarefas `[x]` e as *Notas do agente* dizem como o código atual funciona. Depois leia o "Mapa rápido do código" e as "Decisões e desvios".
2. **Execute apenas a próxima tarefa `[ ]`**, a menos que o prompt indique outra. Não adiante partes de tarefas futuras.
3. **Confira o "Depende de".** Se depender de algo de B ou C que ainda não está na `main`, **pare e avise**.
4. Siga o ciclo **TDD** do `CLAUDE.md`: testes primeiro (vendo falhar por asserção), código mínimo, refatoração. A tarefa só termina com `typecheck` e `test:coverage` verdes (e `lint` depois do Sprint 0).
5. **Ao concluir:** marque `[x]`, preencha as *Notas do agente* (modelo abaixo), atualize o "Mapa rápido do código" e termine a resposta com a mensagem de commit sugerida. **Não faça commit.**
6. **Contratos.** Mudanças em `packages/shared` ou divergências do `architecture.md` exigem perguntar ao usuário. Divergências aprovadas vão para "Decisões e desvios".
7. **Pastas.** A parte A é dona de `packages/domain`. A25 e A26 são as únicas exceções (ver `divisao-tarefas.md` §3).

**Modelo das Notas do agente:**

```
- Feito: <1–2 linhas sobre o que passou a existir>
- Arquivos: <caminhos principais>
- Como usar: <assinatura que os próximos passos vão chamar>
- Testes: <arquivo(s) de teste e quantidade de testes>
- Decisões: <escolhas não óbvias; "nenhuma" se não houver>
```

**Git.** Uma branch por tarefa (`feat/domain-<nº>-<slug>`) ou uma branch com um commit por tarefa; PR para a `main` com CI verde.

---

## Mapa rápido do código

> Mantido pelo agente. Uma linha por módulo: caminho (relativo a `packages/domain`) → para que serve.

- `src/index.ts` → única API pública do pacote; os testes importam daqui (A1)
- `src/model.ts` → tipos do agregado da §5.1 (provisório até a S0.3a; depois reexporta de `@voto/shared`) (A1)
- `src/errors.ts` → `DOMAIN_ERROR_CODES` e `DomainError` (A1)
- `src/result.ts` → `Result<T>`, `ok`, `fail` (A1)
- `src/context.ts` → `DomainContext` (relógio e ids) e `CodeGenerator` (A1)
- `test/builders/` → `anElection()`, `aPosition()`, `aCandidate()`, `aVoter()`, `aRound()`, `fixedContext()`, `secondsAfter()`, `sequenceCodeGenerator()` (A2)
- `src/election/election.ts` → `createElection`, `updateElection`, `DEFAULT_VOTING_SECONDS` (A3)
- `src/election/guards.ts` → validações reaproveitadas (prazo, `requireDraft`, `requireNotFinished`, `requireOpen`) (A3)
- `src/election/positions.ts` → `addPosition`, `updatePosition`, `removePosition` (A4)
- `src/election/lookup.ts` → buscas e substituições imutáveis no agregado (`findPosition`, `isElected`, `findOpenRound`, `replaceRound`...) (A4)
- `src/election/candidates.ts` → `addCandidate`, `updateCandidate`, `removeCandidate` (A5)
- `src/election/voters.ts` → `credentialVoters`, `revokeVoter` (A6)
- `src/voters/code.ts` → `createCodeGenerator`, `CODE_ALPHABET`, `CODE_LENGTH` (A7)
- `src/eligibility/eligibility.ts` → `eligibleCandidates`, `attachableCandidates`, `attachExistingCandidate` (A8)
- `src/tiebreak/tiebreak.ts` → `rankByTiebreak` (Strategy por regra + fallback por `createdAt` e id) (A9)
- `src/tally/compute-result.ts` → `computeResult` e tipos `RoundResult`, `RoundOutcome`, `CandidateCount` (A10)
- `src/tally/runoff-cut.ts` → `cutForRunoff`: finalistas do 2º turno com empate na fronteira (interno) (A11)
- `src/election/rounds.ts` → `openElection`, `openRound`; internos `checkCanStartRound`, `startRound` (A12)
- `src/election/vote.ts` → `castVote` (A13)
- `src/election/close.ts` → `closeRound`, `closeRoundIfDue`; internos `finalizeRound`, `everyoneVoted` (A14)

---

## Tarefas

### [x] A1 — Fundações: `Result`, `DomainError`, `DomainContext`
**Ref.:** architecture §5.1, §5.2.
**Fazer:** tipos do agregado, catálogo de códigos de erro, `DomainError`, `Result<T>` com `ok`/`fail`, `DomainContext` e `CodeGenerator`; `index.ts` como única porta de entrada.
**Testes (escrever antes):** `fail` produz um `DomainError` com código e mensagem; códigos únicos e em `UPPER_SNAKE_CASE`.
**Commit sugerido:** `feat(domain): adiciona Result, DomainError e contexto do domínio`
**Notas do agente:**
- Feito: base do pacote `@voto/domain` (package.json, tsconfig, vitest.config com limite de 80%) e os tipos/erros fundamentais.
- Arquivos: `src/model.ts`, `src/errors.ts`, `src/result.ts`, `src/context.ts`, `src/index.ts`.
- Como usar: `ok(value)`, `fail('CODE', 'message')`; testes conferem erros com `toMatchObject({ ok: false, error: { code } })`.
- Testes: `test/result.test.ts` (5).
- Decisões: o Sprint 0 ainda não existia, então o pacote nasceu autocontido (ver "Decisões e desvios"). `DomainError` estende `Error`, para o servidor poder lançá-lo na borda.

### [x] A2 — Test data builders e `FixedContext`
**Ref.:** architecture §10.3; CLAUDE.md (DAMP, builders).
**Fazer:** builders com valores padrão válidos e `fixedContext()` determinístico.
**Testes (escrever antes):** não se aplica (código de teste); validado pelo `typecheck` e pelo uso nas tarefas seguintes.
**Commit sugerido:** `test(domain): adiciona builders de dados de teste e contexto fixo`
**Notas do agente:**
- Feito: builder fluente de eleição e fábricas de cargo, candidato, eleitor e rodada; contexto com relógio parado e ids `id-1`, `id-2`...
- Arquivos: `test/builders/election-builder.ts`, `test/builders/fixed-context.ts`.
- Como usar: `anElection().open().withPositions(aPosition({ id: 'president' })).withCandidates(aCandidate()).build()`; sem `withQueue`, a fila é a ordem dos cargos `PENDING`. `fixedContext(now?)`, `secondsAfter(base, s)`, `sequenceCodeGenerator(codes)`.
- Testes: nenhum próprio.
- Decisões: os builders montam o agregado direto (sem passar pelos comandos), para cada teste preparar exatamente o estado de que precisa.

### [x] A3 — `createElection` e edição da eleição
**Ref.:** architecture §5.1, §6.1.
**Fazer:** criar eleição em `DRAFT`; editar nome e prazo padrão com validação.
**Testes (escrever antes):** criação vazia; nome sem espaços nas pontas; nome em branco; limites do prazo (5 e 3600 aceitos; 4, 3601 e fracionário rejeitados); edição; edição de eleição encerrada.
**Commit sugerido:** `feat(domain): cria e edita eleições com validação`
**Notas do agente:**
- Feito: `createElection` e `updateElection`.
- Arquivos: `src/election/election.ts`, `src/election/guards.ts`.
- Como usar: `createElection({ adminId, name, defaultVotingSeconds? }, ctx): Result<Election>`; `updateElection(election, { name?, defaultVotingSeconds? })`.
- Testes: `test/election.test.ts` (13).
- Decisões: `createElection` devolve `Result` (a §5.2 previa `Election`) porque valida nome e prazo. Prazo padrão de 60 s.

### [x] A4 — Cargos: adicionar, editar, remover
**Ref.:** architecture §5.1, §5.3.
**Fazer:** cargos com título único e regra de desempate válida; entram no fim da fila.
**Testes (escrever antes):** adicionar no fim da fila; título em branco ou duplicado (sem diferenciar maiúsculas); regra inválida; adicionar com eleição aberta; editar regra; título de outro cargo; cargo inexistente; cargo já decidido; remover; remover com candidatos; remover com eleição aberta.
**Commit sugerido:** `feat(domain): adiciona gestão de cargos da eleição`
**Notas do agente:**
- Feito: `addPosition`, `updatePosition`, `removePosition`.
- Arquivos: `src/election/positions.ts`, `src/election/lookup.ts`, `src/election/guards.ts`.
- Como usar: `addPosition(election, { title, tiebreak }, ctx)`; `updatePosition(election, positionId, { title?, tiebreak? })`; `removePosition(election, positionId)`.
- Testes: `test/positions.test.ts` (15).
- Decisões: adicionar e remover só em `DRAFT`; editar só cargo `PENDING`; remover é bloqueado se algum candidato concorre ao cargo (`POSITION_HAS_CANDIDATES`).

### [x] A5 — Candidatos: criar, editar, remover
**Ref.:** architecture §5.1, §5.4 (elegibilidade 2).
**Fazer:** validação de nome, idade, tempo restante, `applications` e `firstChoicePositionId`.
**Testes (escrever antes):** cadastro com `createdAt`; cadastro com eleição aberta; nome em branco; idade nos limites (16 e 120) e fora deles; meses negativos; candidaturas vazias ou repetidas; cargo inexistente; primeira opção fora das candidaturas; eleição encerrada; edição da primeira opção; edição que derruba a primeira opção; candidato inexistente; candidato eleito; remoção; remoção de quem está na cédula aberta; remoção de eleito.
**Commit sugerido:** `feat(domain): cadastra candidatos e valida candidaturas`
**Notas do agente:**
- Feito: `addCandidate`, `updateCandidate`, `removeCandidate`.
- Arquivos: `src/election/candidates.ts`, `src/election/lookup.ts` (`findCandidate`, `replaceCandidate`, `isElected`, `findOpenRound`).
- Como usar: `addCandidate(election, { name, age, remainingMonths, applications, firstChoicePositionId }, ctx)`.
- Testes: `test/candidates.test.ts` (22).
- Decisões: candidato eleito não pode ser editado nem removido (o resultado registrado não muda depois). Cadastro permitido com a eleição aberta (README: candidatos insuficientes).

### [x] A6 — Credenciamento de eleitores
**Ref.:** architecture §5.5 (credenciar eleitor), §6.1 (`POST /voters`).
**Fazer:** gerar N eleitores com códigos do `CodeGenerator` injetado; rótulos opcionais; revogação.
**Testes (escrever antes):** um eleitor por código; rótulos em ordem; mantém eleitores anteriores; quantidade 0, 501 e fracionária; mais rótulos que eleitores; código repetido (já existente e na mesma leva); eleição encerrada; revogar; eleitor inexistente; revogar duas vezes.
**Commit sugerido:** `feat(domain): credencia e revoga eleitores`
**Notas do agente:**
- Feito: `credentialVoters` e `revokeVoter`.
- Arquivos: `src/election/voters.ts`.
- Como usar: `credentialVoters(election, { count, labels? }, codeGenerator, ctx): Result<{ election, codes }>`.
- Testes: `test/voters.test.ts` (13).
- Decisões: o domínio só garante a unicidade dentro da eleição (`DUPLICATE_VOTER_CODE`); a unicidade global é do servidor (B11). Recebe um objeto de entrada (regra "mais de 3 parâmetros → objeto").

### [x] A7 — Gerador de códigos puro
**Ref.:** architecture §5.5 (formato do código).
**Fazer:** 8 caracteres do alfabeto sem ambíguos, com a fonte de aleatoriedade injetada.
**Testes (escrever antes):** código montado a partir dos índices sorteados; último caractere do alfabeto; a fonte é chamada com o tamanho do alfabeto; índice fora do alfabeto lança `RangeError`; alfabeto sem `0 O 1 I L`; tamanho 8.
**Commit sugerido:** `feat(domain): gera códigos de eleitor com aleatoriedade injetada`
**Notas do agente:**
- Feito: `createCodeGenerator(randomIndex)`.
- Arquivos: `src/voters/code.ts`.
- Como usar: no servidor (B11), `createCodeGenerator((max) => crypto.randomInt(max))`.
- Testes: `test/code-generator.test.ts` (6).
- Decisões: nenhuma.

### [x] A8 — Elegibilidade e anexar candidato existente
**Ref.:** architecture §5.4 (elegibilidade 1, 3, 4).
**Fazer:** aptos por cargo (concorre e não foi eleito); candidatos anexáveis; anexar candidato não eleito a cargo pendente.
**Testes (escrever antes):** só quem concorre; exclui eleito em outro cargo; anexáveis; anexar inclui o cargo nas candidaturas; não duplica; eleito; candidato e cargo inexistentes; cargo não pendente.
**Commit sugerido:** `feat(domain): calcula aptos e permite anexar candidato existente`
**Notas do agente:**
- Feito: `eligibleCandidates`, `attachableCandidates`, `attachExistingCandidate`.
- Arquivos: `src/eligibility/eligibility.ts`.
- Como usar: `eligibleCandidates(election, positionId): Candidate[]`.
- Testes: `test/eligibility.test.ts` (9).
- Decisões: anexar não muda a primeira opção do candidato.

### [x] A9 — Desempate (Strategy)
**Ref.:** architecture §5.4 (desempate), §5.5.
**Fazer:** comparador por regra e fallback determinístico.
**Testes (escrever antes):** `YOUNGEST`, `OLDEST`, `MOST_REMAINING_TIME`; fallback por `createdAt`; último recurso por id; não altera a lista recebida.
**Commit sugerido:** `feat(domain): implementa regras de desempate entre candidatos`
**Notas do agente:**
- Feito: `rankByTiebreak(candidates, rule)`.
- Arquivos: `src/tiebreak/tiebreak.ts`.
- Como usar: `rankByTiebreak(tied, position.tiebreak)[0]` é o vencedor.
- Testes: `test/tiebreak.test.ts` (6).
- Decisões: depois do `createdAt`, desempata pelo id, para o resultado nunca depender da ordem de entrada.

### [x] A10 — Apuração do 1º turno
**Ref.:** architecture §5.4 (apuração 1, 2, 3, 6).
**Fazer:** contagem, válidos × brancos, maioria > 50%, casos de 1 e 2 candidatos, sem votos válidos.
**Testes (escrever antes):** contagem ordenada com brancos à parte; 50% + 1 elege; exatamente 50% vai para 2º turno; brancos fora da maioria; 2 candidatos; empate entre 2 resolvido pela regra; 1 candidato; só brancos; rodada aberta lança erro.
**Commit sugerido:** `feat(domain): apura o primeiro turno com maioria sobre votos válidos`
**Notas do agente:**
- Feito: `computeResult(round, position, candidates): RoundResult`.
- Arquivos: `src/tally/compute-result.ts`.
- Como usar: o resultado traz `outcome` (`ELECTED`/`RUNOFF_REQUIRED`/`NO_VALID_VOTES`), `counts`, `blank`, `validVotes`, `electedCandidateId?`, `runoffCandidateIds?`, `tiebreakApplied`.
- Testes: `test/compute-result.test.ts` (9).
- Decisões: `counts` vem do mais para o menos votado; empates seguem a ordem da cédula.

### [x] A11 — Corte para o 2º turno com empates
**Ref.:** architecture §5.4 (apuração 4).
**Fazer:** escolher exatamente 2 finalistas aplicando o desempate só entre os empatados na fronteira.
**Testes (escrever antes):** dois empatados no topo vão sem desempate; três empatados no topo; empate no 2º lugar desempatado só entre os empatados.
**Commit sugerido:** `feat(domain): resolve empates na fronteira do segundo turno`
**Notas do agente:**
- Feito: `cutForRunoff` (interno), usado por `computeResult`.
- Arquivos: `src/tally/runoff-cut.ts`.
- Como usar: via `computeResult(...).runoffCandidateIds`.
- Testes: `test/runoff-cut.test.ts` (3).
- Decisões: nenhuma.

### [x] A12 — Abertura da eleição e das rodadas
**Ref.:** architecture §5.3, §5.4 (votação 5; elegibilidade 3).
**Fazer:** `openElection`; `openRound` com cédula e eleitores congelados e prazo absoluto.
**Testes (escrever antes):** abrir eleição; sem cargos; abrir duas vezes; rodada com cédula e eleitores congelados; cargo `VOTING` e fora da fila; prazo padrão; eleito fora da cédula; revogado fora da rodada; segunda rodada aberta; 2º turno pendente; cargo não pendente; cargo inexistente; sem aptos; sem eleitores; prazo inválido; eleição em `DRAFT`.
**Commit sugerido:** `feat(domain): abre a eleição e rodadas com cédula congelada`
**Notas do agente:**
- Feito: `openElection`, `openRound`.
- Arquivos: `src/election/rounds.ts`.
- Como usar: `openRound(election, { positionId, durationSeconds? }, ctx)`.
- Testes: `test/rounds.test.ts` (16).
- Decisões: recebe objeto de entrada (formato do corpo da rota). Bloqueia com 2º turno pendente (`RUNOFF_PENDING`) e sem eleitores credenciados (`NO_CREDENTIALED_VOTERS`). O admin pode abrir qualquer cargo pendente, não só o do topo da fila.

### [x] A13 — Votação
**Ref.:** architecture §5.4 (votação 1, 2, 3), §5.1 (sigilo).
**Fazer:** `castVote` com eleitor apto, voto único, prazo e sigilo.
**Testes (escrever antes):** conta o voto e registra quem votou; branco; contagem sem id de eleitor; voto no prazo exato; voto depois do prazo; voto duplo; eleitor credenciado depois da abertura; eleitor revogado; escolha fora da cédula; rodada fechada; rodada inexistente.
**Commit sugerido:** `feat(domain): registra votos com sigilo, prazo e voto único`
**Notas do agente:**
- Feito: `castVote`.
- Arquivos: `src/election/vote.ts`.
- Como usar: `castVote(election, { roundId, voterId, choice }, ctx)`; `choice` é o id do candidato ou `BLANK`.
- Testes: `test/vote.test.ts` (11).
- Decisões: voto no instante exato do prazo é aceito; depois, `ROUND_EXPIRED`. A tolerância de rede (`VOTE_GRACE_MS`) fica no servidor, que desconta do `now`.

### [x] A14 — Fechamento da rodada → **marco M1**
**Ref.:** architecture §5.3, §5.4 (votação 4, apuração 6), §8.3.
**Fazer:** fechamento manual, fechamento por prazo ou por todos terem votado, e aplicação do resultado ao cargo.
**Testes (escrever antes):** fecha e elege; vai para 2º turno; sem votos válidos volta ao início da fila; rodada já fechada; rodada inexistente; fecha depois do prazo; continua aberta no prazo exato; fecha quando todos votaram; nada muda sem rodada aberta; último voto fecha a rodada.
**Commit sugerido:** `feat(domain): fecha rodadas e aplica o resultado ao cargo`
**Notas do agente:**
- Feito: `closeRound`, `closeRoundIfDue`; `castVote` fecha a rodada no último voto.
- Arquivos: `src/election/close.ts`, `src/election/vote.ts`.
- Como usar: `closeRoundIfDue(election, ctx)` devolve a **mesma instância** se nada mudou (o servidor compara com `===` para decidir se salva); `closeRound(election, roundId)`.
- Testes: `test/close.test.ts` (10).
- Decisões: `closeRound` não recebe `ctx` (não usa tempo nem ids).

### [ ] A15 — 2º turno
**Ref.:** architecture §5.4 (apuração 5), §5.5.
**Fazer:** `openRunoff` com os finalistas do último 1º turno; apuração do 2º turno com desempate.
**Testes (escrever antes):** abre com os dois finalistas; repete o 2º turno após 2º turno sem votos válidos; cargo sem 2º turno pendente; cargo inexistente; outra rodada aberta; elege o mais votado; empate resolvido pela regra; 2º turno sem votos válidos.
**Commit sugerido:** `feat(domain): abre e apura o segundo turno`
**Notas do agente:** _pendente_

### [ ] A16 — Liberação de resultados e visões por papel
**Ref.:** architecture §5.4 (votação 7), §6.3 (`VoterStateDTO`, `RoundResultDTO`).
**Fazer:** `releaseResults`; o que o eleitor vê em cada fase; resultado com nomes para o admin.
**Testes (escrever antes):** liberar rodada fechada; rodada aberta; rodada inexistente; último resultado com nomes; sem rodada fechada; espera antes de tudo; cédula sem contagem; voto registrado; eleitor tardio espera; resultado escondido até liberar; resultado liberado; eleição encerrada.
**Commit sugerido:** `feat(domain): libera resultados e define o que cada papel pode ver`
**Notas do agente:** _pendente_

### [ ] A17 — Fila: próximo passo e ordem manual
**Ref.:** architecture §5.4 (candidatos insuficientes), §6.3 (`NextPositionDTO`).
**Fazer:** `nextPositionStatus` e `applyOrder`.
**Testes (escrever antes):** pronto; candidatos insuficientes com anexáveis; nada sobrando; rodada em andamento; 2º turno pendente primeiro; aplicar ordem; ordem que omite, repete ou inventa cargo; eleição encerrada.
**Commit sugerido:** `feat(domain): informa o próximo cargo da fila e aplica nova ordem`
**Notas do agente:** _pendente_

### [ ] A18 — Candidatos insuficientes: adiar e cancelar
**Ref.:** architecture §5.4 (candidatos insuficientes), §6.1 (`defer`, `cancel`).
**Fazer:** `deferPosition` e `cancelPosition` com `confirmTitle`.
**Testes (escrever antes):** adiar para o fim; adiar cargo fora da fila; cargo inexistente; cancelar com título confirmado; cancelar cargo aguardando 2º turno; confirmação diferente, em outra caixa ou vazia; cancelar cargo em votação.
**Commit sugerido:** `feat(domain): permite adiar e cancelar cargos com dupla confirmação`
**Notas do agente:** _pendente_

### [ ] A19 — Algoritmo `suggestOrder`
**Ref.:** architecture §5.4 (algoritmo de ordenação).
**Fazer:** ordenar os cargos da fila por disputa, conflitos, aptos e primeira opção, de forma estável.
**Testes (escrever antes):** mais conflitos primeiro; mais aptos no empate; mais primeiras opções no empate; cargos com menos de 2 aptos no fim; ordem atual mantida quando tudo empata.
**Commit sugerido:** `feat(domain): sugere a ordem de votação dos cargos`
**Notas do agente:** _pendente_

### [ ] A20 — Resiliência: histórico e anulação
**Ref.:** architecture §5.4 (resiliência).
**Fazer:** `pushSnapshot`, `undo`, limite de 50; `annulRound`.
**Testes (escrever antes):** começa sem desfazer; guarda o anterior; desfaz; nada para desfazer; esquece além do limite; limite padrão 50; anular rodada aberta; anular desfaz o eleito; não é a última rodada; rodada inexistente.
**Commit sugerido:** `feat(domain): adiciona histórico para desfazer e anulação de rodadas`
**Notas do agente:** _pendente_

### [ ] A21 — `finishElection`
**Ref.:** architecture §5.3.
**Fazer:** encerrar a eleição aberta sem rodada em andamento.
**Testes (escrever antes):** encerra; rodada aberta; eleição nunca aberta; nada muda depois.
**Commit sugerido:** `feat(domain): encerra a eleição`
**Notas do agente:** _pendente_

### [ ] A22 — Cenário completo só com a API pública
**Ref.:** architecture §10.
**Fazer:** eleição com dois cargos, 2º turno e exclusão do eleito, só com funções do `index.ts`.
**Testes (escrever antes):** resultado do 2º turno liberado ao eleitor; próximo cargo pronto; eleito fora da cédula seguinte; encerramento com todos os cargos decididos.
**Commit sugerido:** `test(domain): adiciona cenário completo de eleição pela API pública`
**Notas do agente:** _pendente_

### [ ] A23 — StrykerJS no domínio
**Ref.:** architecture §2 (teste de mutação); aula 15.
**Fazer:** configurar o Stryker, rodar, matar os mutantes sobreviventes relevantes e registrar o *mutation score*.
**Testes (escrever antes):** novos testes para os sobreviventes relevantes.
**Commit sugerido:** `test(domain): configura StrykerJS e mata mutantes sobreviventes`
**Notas do agente:** _pendente_

### [ ] A24 — Revisão de *test smells* e README do pacote
**Ref.:** architecture §10.3; CLAUDE.md (smells).
**Fazer:** revisar nomes, AAA, magic numbers, lógica condicional; escrever `packages/domain/README.md`.
**Testes (escrever antes):** não se aplica.
**Commit sugerido:** `docs(domain): documenta o pacote e revisa a suíte de testes`
**Notas do agente:** _pendente_

### [ ] A25 — *(vinda da B19)* Rate limit no login e na sessão do eleitor
**Depende de:** B6 e B13 na `main`.
**Ref.:** architecture §8.4.
**Fazer:** `apps/server/src/http/rate-limit.ts` com `@fastify/rate-limit` em `POST /api/admin/login` e `POST /api/voter/session`, registrado no `buildApp` com uma linha. Avisar B antes do PR.
**Testes (escrever antes):** integração com `app.inject`: a tentativa N+1 recebe `429`; outra rota não é limitada.
**Commit sugerido:** `feat(server): limita tentativas de login e de entrada do eleitor`
**Notas do agente:** _pendente_

### [ ] A26 — *(vinda da B22)* `codecov.yml`, badges e artefato do Playwright
**Depende de:** S0.6 na `main`; combinar com B a edição do `ci.yml`.
**Ref.:** architecture §12.
**Fazer:** `codecov.yml` (flags `shared`/`domain`/`server`/`web`, meta de 80%, comentário em PR), badges de CI e Codecov no README, upload do relatório do Playwright como artefato no `ci.yml`.
**Testes (escrever antes):** não se aplica (configuração).
**Commit sugerido:** `ci: configura Codecov com flags por pacote e badges no README`
**Notas do agente:** _pendente_

---

## Decisões e desvios

> Registro de decisões que mudam ou detalham o `architecture.md`. Formato: `AAAA-MM-DD — tarefa — decisão — motivo`.

- 2026-11-22 — A1 — o `packages/domain` foi criado **antes do Sprint 0**, autocontido: `package.json`, `tsconfig.json`, `vitest.config.ts` e `.gitignore` próprios, e tipos do agregado em `src/model.ts`. Na integração: a S0.1/S0.2 absorve as configs na raiz; a S0.3a cria os tipos em `@voto/shared` e `model.ts` passa a reexportá-los; a S0.4 deixa de ser necessária (a API pública já existe, implementada). O tipo `DomainApi = typeof import('./index')` pode ser exportado na integração. — permitir que A avançasse sem esperar B.
- 2026-11-22 — A1 — os códigos de `DOMAIN_ERROR_CODES` precisam estar no `ERROR_CODES` da S0.3a. — contrato com o servidor (mapeamento HTTP) e o front.
- 2026-11-22 — A3 — `createElection` devolve `Result<Election>` (a §5.2 previa `Election`). — valida nome e prazo.
- 2026-11-22 — A6/A12/A13/A15 — comandos com mais de 3 parâmetros recebem objeto: `credentialVoters(e, { count, labels? }, codeGen, ctx)`, `openRound(e, { positionId, durationSeconds? }, ctx)`, `openRunoff(e, { positionId, durationSeconds? }, ctx)`, `castVote(e, { roundId, voterId, choice }, ctx)`. — regra do CLAUDE.md; os objetos têm o formato dos corpos das rotas.
- 2026-11-22 — A14 — `closeRound(e, roundId)` sem `ctx`. — não usa tempo nem ids.
- 2026-11-22 — A12 — `openRound` bloqueado com 2º turno pendente (`RUNOFF_PENDING`) e sem eleitores credenciados (`NO_CREDENTIALED_VOTERS`). — evita que um finalista seja eleito em outro cargo no meio do caminho e rodadas que fechariam sozinhas.
