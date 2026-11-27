# Vota Aê

[![CI](https://github.com/odannyraro/voto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/odannyraro/voto/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/odannyraro/voto/branch/main/graph/badge.svg)](https://codecov.io/gh/odannyraro/voto)

Sistema web de eleições ao vivo, no estilo Kahoot: o admin conduz a votação cargo a cargo, e os eleitores votam pelo celular, com o resultado aparecendo em tempo real. Trabalho prático da disciplina de Teste de Software (DCC/UFMG).

**Sistema no ar:** https://vota-ae.onrender.com

> O servidor está no plano gratuito do Render: depois de um tempo sem acesso, ele "dorme", e o primeiro acesso pode levar cerca de 1 minuto.

| Entrega | Link |
|---|---|
| Sistema em produção | https://vota-ae.onrender.com |
| Repositório | https://github.com/odannyraro/voto |
| Build no GitHub Actions | _a preencher: link da execução mais recente com sucesso_ |
| Relatório de cobertura (Codecov) | https://app.codecov.io/gh/odannyraro/voto |
| Vídeo no YouTube | _a preencher_ |

## Integrantes

- Daniel Rodrigues
- Gustavo Chaves Ferreira
- Júlio Assis Souza Amorim

## Sobre o sistema

O Vota Aê foi pensado para eleições presenciais de grupos, como a escolha de uma diretoria: todos estão na mesma sala, cada um com o seu celular, e a eleição acontece ao vivo, um cargo por vez.

**Como funciona**

1. O **admin** entra com usuário e senha, cria a eleição e configura os cargos, os candidatos e a ordem de votação.
2. Ele gera os **códigos dos eleitores**: um código único e aleatório por pessoa, válido só naquela eleição.
3. O **eleitor** abre o site, digita o código e aguarda.
4. O admin abre a votação de um cargo. A cédula aparece na hora no celular de todos, com um prazo para votar.
5. A rodada fecha quando todos votam ou quando o prazo acaba. O admin vê o resultado e decide quando liberá-lo aos eleitores.

**Regras da eleição**

- **Candidatos:** cada candidato tem nome, idade e tempo restante na universidade, e pode concorrer a vários cargos, com um deles marcado como primeira opção. Quem é eleito sai automaticamente da disputa dos cargos seguintes.
- **Segundo turno:** se houver mais de 2 candidatos e ninguém passar de 50% dos votos válidos, o admin pode abrir um segundo turno com os dois mais votados.
- **Desempate:** por candidato mais novo, mais velho ou com mais tempo restante na universidade, escolhido em cada cargo.
- **Candidatos insuficientes:** se um cargo chegar à vez sem candidatos disponíveis, o admin pode incluir um candidato de outro cargo, cadastrar novos, mover o cargo para o fim da fila ou, com dupla confirmação, cancelá-lo.
- **Ordem de votação:** definida pelo admin, com um botão que sugere uma ordem para evitar conflitos entre cargos.
- **Desfazer:** o admin pode voltar passos da eleição (por exemplo, reabrir um cargo decidido por engano ou desfazer a liberação de um resultado). Também pode anular uma rodada.
- **Voto secreto:** o eleitor nunca vê os códigos dos outros nem a contagem de votos antes da liberação; brancos não contam como votos válidos.

O texto original dos requisitos está em [docs/requisitos.md](docs/requisitos.md).

_A preencher: estado final das telas (eleitor e admin) e, se o grupo quiser, capturas de tela._

## Tecnologias

| Área | Tecnologias |
|---|---|
| Linguagem e organização | TypeScript em modo estrito e Node 24, num monorepo com *npm workspaces*: regras da eleição (`packages/domain`), contratos compartilhados (`packages/shared`), servidor (`apps/server`) e front (`apps/web`) |
| Regras da eleição | Funções puras, sem banco nem rede: cada ação do admin ou do eleitor recebe a eleição e devolve a eleição nova ou um erro de negócio |
| Front-end | React 19, React Router e cliente Socket.IO, com build pelo Vite |
| Servidor | Fastify (API REST), Socket.IO (tempo real), validação com Zod, login com JWT e senhas com bcrypt |
| Banco de dados | PostgreSQL, hospedado no [Neon](https://neon.tech) |
| Testes | Vitest (unidade e integração), Testing Library e MSW (front), pg-mem (Postgres em memória), StrykerJS (teste de mutação) e Playwright (e2e) |
| Qualidade | ESLint, Prettier e cobertura mínima de 80% por pacote, que faz o build falhar se não for atingida |
| CI/CD | GitHub Actions em Linux, macOS e Windows; cobertura publicada no [Codecov](https://codecov.io/gh/odannyraro/voto); deploy automático no [Render](https://render.com) |

**Integração e entrega contínuas.** A cada push, o GitHub Actions roda lint, formatação, checagem de tipos, todos os testes com cobertura e o build de produção nos três sistemas operacionais. Quando esse processo termina verde na `main`, outro workflow publica exatamente aquele commit no Render. Assim, código com teste quebrado nunca chega à produção.

**Arquitetura.** As regras da eleição ficam isoladas do resto: o servidor só carrega a eleição, chama a regra, grava e avisa os celulares pelo Socket.IO. Isso permite testar as regras de forma rápida e determinística, e testar o servidor com as regras reais. Os detalhes estão em [docs/architecture.md](docs/architecture.md), e a referência da API (rotas e eventos, com exemplos) em [docs/api.md](docs/api.md).

## Uso de IA

O projeto foi desenvolvido com agentes de IA para programação: o **Claude Code**, usado por dois integrantes, e o **GitHub Copilot**, usado por um. Cada um usou a ferramenta que preferia, mas todos seguiram as mesmas regras e o mesmo ciclo de trabalho.

**As regras, num arquivo comum.** Antes da primeira linha de código, o grupo escreveu um arquivo Markdown com as instruções que todo agente seguia a cada tarefa, o [CLAUDE.md](CLAUDE.md). Apesar do nome, ele é genérico e pode ser lido por qualquer ferramenta. Ele define:

- **TDD:** o teste vem primeiro e precisa falhar antes de o código existir;
- as **boas práticas de teste** da disciplina: padrão AAA, um comportamento por teste, nomes descritivos, *test doubles* só nas fronteiras e a lista de *test smells* proibidos;
- o que o agente **não pode fazer**: apagar ou afrouxar testes para "ficar verde", reduzir a cobertura ou mexer na parte de outro integrante;
- o padrão das mensagens de commit.

**O plano.** A arquitetura, os contratos da API e a divisão do trabalho foram escritos antes do código ([docs/architecture.md](docs/architecture.md) e [docs/divisao-tarefas.md](docs/divisao-tarefas.md)). Cada integrante teve uma lista de tarefas pequenas ([servidor](docs/todo-backend.md), [domínio](docs/todo-domain.md) e [front-end](docs/todo-frontend.md)), que também servia de memória para o agente: ao concluir uma tarefa, ele registrava o que fez, as decisões tomadas e as pendências.

**O ciclo de cada tarefa**

1. O agente lia as regras e a lista de tarefas, escrevia os testes, implementava e rodava toda a verificação (lint, tipos, testes e cobertura).
2. O integrante revisava o resultado, testava e, quando precisava, corrigia à mão.
3. Se a revisão achava algo, havia um novo ciclo com o agente para ajustar.
4. Com tudo verde, a tarefa era concluída e commitada. A maior parte das tarefas foi feita numa branch específica de cada parte, levada depois à `main` por pull request, com o CI verde.

**Revisões que acharam problemas.** Ao fim de cada bloco de tarefas, o código foi revisado e refatorado. Essas revisões, junto com testes manuais no sistema real, acharam problemas que os testes ainda não cobriam, e cada um foi corrigido com um teste de regressão escrito antes da correção. Por exemplo: votos simultâneos sendo recusados, um corpo de requisição vazio rejeitado pelo servidor e uma configuração de produção que aceitaria um segredo de desenvolvimento.

**Teste de mutação.** Para conferir se os testes do domínio realmente detectam erros, foi usado o StrykerJS, e os casos que escapavam ganharam testes novos.

**O que aprendemos.** A IA acelerou muito a escrita de código e de testes, mas precisou de regras claras, tarefas pequenas e revisão constante. Sem isso, ela tende a escrever testes que não falham nunca, mudar o comportamento ao "refatorar" ou declarar uma tarefa pronta sem conferir.

## Testes

| Pacote | O que é testado | Testes | Cobertura de linhas |
|---|---|---|---|
| `packages/domain` | Regras da eleição: apuração, segundo turno, desempates, exclusão do eleito, desfazer | 223 | 98% |
| `packages/shared` | Contratos e validação das requisições | 138 | 100% |
| `apps/server` | Rotas, tempo real, banco, prazos, concorrência e cenários completos de eleição pela API | 631 | 99% |
| `apps/web` | Componentes, telas do eleitor e comunicação com o servidor | 134 | 95% |
| e2e | _a preencher_ | _a preencher_ | — |

- **Unidade:** o domínio é testado com as regras reais, sem simulações, e os testes de componente do front simulam a rede com MSW.
- **Integração:** o servidor é testado com o domínio real, chamando a API como um cliente faria, com um cliente Socket.IO real e com um Postgres em memória. Os mesmos testes de contrato rodam contra o repositório em memória e contra o Postgres.
- **Teste de mutação:** no domínio, o StrykerJS chegou a **91,9%** de mutantes detectados.
- **End-to-end:** _a preencher (Playwright: jornadas cobertas)._

## Execução dos testes

**Pré-requisito:** Node.js 24.15 ou mais recente.

Na raiz do repositório:

```bash
npm ci                   # instala as dependências
npm test                 # roda todos os testes
npm run test:coverage    # roda os testes com cobertura (falha abaixo de 80% em algum pacote)
```

Os testes não precisam de banco de dados, internet nem configuração: usam banco em memória e relógio simulado. O relatório de cobertura de cada pacote fica em `<pacote>/coverage/index.html`.

Teste de mutação do domínio (leva cerca de 2 minutos):

```bash
npm run test:mutation -w packages/domain
```

Testes end-to-end:

```bash
# a preencher
```

Para usar o sistema localmente (as eleições ficam em memória e somem ao fechar):

```bash
npm run build
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm start   # abre em http://localhost:3000
```
