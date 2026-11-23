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

Os tipos do agregado (`Election`, `Position`, `Candidate`...) são definidos em `@voto/shared`, para o servidor e o frontend usarem as mesmas formas. `src/model.ts` só os reexporta. O domínio não importa nenhum outro pacote do monorepo.

## Testes

Na raiz do monorepo:

```bash
npm test -w packages/domain                # testes de unidade (Vitest)
npm run test:coverage -w packages/domain   # com cobertura (falha abaixo de 80%)
npm run test:mutation -w packages/domain   # teste de mutação (StrykerJS), relatório em reports/mutation/
npm run typecheck -w packages/domain
```

O teste de mutação não roda no CI (é lento demais para os 3 sistemas operacionais). Ele é rodado à mão antes de PRs que mexem nas regras.

- Os testes ficam em `test/` e importam só de `src/index.ts`, ou seja, testam pela API pública.
- `test/builders/` tem os *test data builders* (`anElection()`, `aCandidate()`, `aPosition()`, `aRound()`, `aVoter()`), o `fixedContext()` (relógio parado e ids sequenciais), o `sequenceCodeGenerator()` (stub de códigos), o `countingCodeGenerator()` (códigos distintos para lotes grandes) e o `valueOf()` (extrai o valor de um `Result` de sucesso).
- `test/scenarios/` tem um cenário completo de eleição usando só a API pública.

Números atuais: 223 testes, cobertura de cerca de 98% em linhas e 97% em branches, *mutation score* de 91,9%. Dos mutantes que sobrevivem, a maioria troca só o texto das mensagens de erro; os demais estão em guardas defensivas que a API pública não alcança (agregado inconsistente) ou são equivalentes.
