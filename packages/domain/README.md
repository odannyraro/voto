# @voto/domain

Regras de negócio da eleição, em TypeScript puro: sem I/O, sem relógio, sem aleatoriedade. Tempo, ids e códigos chegam de fora (`DomainContext`, `CodeGenerator`). Por isso tudo aqui é testado com testes de unidade rápidos e determinísticos.

O agregado `Election` é **imutável**: cada comando recebe a eleição e devolve um `Result` com a eleição nova ou um `DomainError` com código estável (ex.: `VOTER_ALREADY_VOTED`). `throw` só acontece em bug de quem chamou.

## API pública (`src/index.ts`)

| Área | Funções |
|---|---|
| Eleição | `createElection`, `updateElection`, `openElection`, `finishElection` |
| Cargos | `addPosition`, `updatePosition`, `removePosition`, `deferPosition`, `cancelPosition` |
| Candidatos | `addCandidate`, `updateCandidate`, `removeCandidate`, `attachExistingCandidate`, `eligibleCandidates`, `attachableCandidates` |
| Eleitores | `credentialVoters`, `revokeVoter`, `createCodeGenerator` |
| Votação | `openRound`, `castVote`, `closeRound`, `closeRoundIfDue`, `openRunoff`, `releaseResults`, `annulRound` |
| Apuração | `computeResult`, `rankByTiebreak` |
| Fila | `nextPositionStatus`, `applyOrder`, `suggestOrder` |
| Visões | `voterView`, `lastResultView` |
| Desfazer | `createHistory`, `pushSnapshot`, `undo`, `canUndo` |

As regras implementadas estão em `docs/architecture.md` §5.4 e §5.5. Os desvios em relação à §5.2 estão em `docs/todo-domain.md`, seção "Decisões e desvios".

## Testes

```bash
npm test                 # testes de unidade (Vitest)
npm run test:coverage    # com cobertura (falha abaixo de 80%)
npm run test:mutation    # teste de mutação (StrykerJS), relatório em reports/mutation/
npm run typecheck
```

- Os testes ficam em `test/` e importam só de `src/index.ts`, ou seja, testam pela API pública.
- `test/builders/` tem os *test data builders* (`anElection()`, `aCandidate()`, `aPosition()`, `aRound()`, `aVoter()`), o `fixedContext()` (relógio parado e ids sequenciais), o `sequenceCodeGenerator()` (stub de códigos) e o `valueOf()` (extrai o valor de um `Result` de sucesso).
- `test/scenarios/` tem um cenário completo de eleição usando só a API pública.

Números atuais: 205 testes, cobertura de cerca de 97% em linhas e 94% em branches, *mutation score* de 89,4% (os mutantes que sobrevivem são, na maioria, trocas do texto das mensagens de erro).
