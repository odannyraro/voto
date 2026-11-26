# Voto

[![CI](https://github.com/odannyraro/voto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/odannyraro/voto/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/odannyraro/voto/branch/main/graph/badge.svg)](https://codecov.io/gh/odannyraro/voto)

Sistema web de eleições ao vivo (estilo Kahoot), feito para o trabalho prático de Teste de Software (DCC/UFMG). As regras originais da eleição estão em [docs/requisitos.md](docs/requisitos.md).

## Integrantes

_a preencher_

## Sobre o sistema

_a preencher_

## Tecnologias

### Backend, infraestrutura e CI

- **Linguagem e monorepo:** TypeScript 7 em modo `strict`, Node 24, *npm workspaces* (`packages/shared`, `packages/domain`, `apps/server`, `apps/web`). ESLint (com a regra de direção dos imports entre pacotes) e Prettier.
- **Contratos (`packages/shared`):** tipos dos DTOs, códigos de erro, eventos do Socket.IO e schemas [Zod](https://zod.dev) dos corpos de requisição, usados pelo servidor e pelo front.
- **Servidor (`apps/server`):** [Fastify](https://fastify.dev) 5 para a API REST, [Socket.IO](https://socket.io) 4 para o tempo real, autenticação com JWT ([jose](https://github.com/panva/jose)) e senha com bcrypt ([bcryptjs](https://github.com/dcodeIO/bcrypt.js)). Arquitetura de portas e adaptadores: o domínio puro decide as regras; o servidor só lê, chama o domínio, grava e notifica.
- **Persistência:** PostgreSQL com o driver [pg](https://node-postgres.com) (uma linha por eleição em `JSONB`, com o histórico do desfazer). Em desenvolvimento e nos testes, repositórios em memória.
- **Build de produção:** [tsup](https://tsup.egoist.dev) gera um único `apps/server/dist/main.js`, que também serve o build do front.
- **Testes do backend:** [Vitest](https://vitest.dev) 5 com cobertura v8; `app.inject` do Fastify para as rotas, cliente Socket.IO real em porta efêmera para o tempo real e [pg-mem](https://github.com/oguimbal/pg-mem) (Postgres em memória) para os adaptadores SQL. *Test doubles* próprios só nas fronteiras: `FakeClock`, `FakeScheduler`, `StubCodeGenerator`, `SpyNotifier`, `SpyLogger`, além de repositórios que seguram ou fazem falhar gravações para testar concorrência.
- **CI/CD:** GitHub Actions em Ubuntu, macOS e Windows (lint, formatação, typecheck, testes com cobertura mínima de 80% por pacote e build), cobertura publicada no [Codecov](https://codecov.io) por pacote e deploy no [Render](https://render.com) com banco no [Neon](https://neon.tech), disparado só depois do CI verde na `main`. Produção: https://voto-jn8l.onrender.com.

A referência da API (rotas e eventos, com exemplos) está em [docs/api.md](docs/api.md) e o desenho completo em [docs/architecture.md](docs/architecture.md).

### Domínio

_a preencher_

### Frontend e testes de sistema

_a preencher_

## Uso de IA

_a preencher_

## Execução dos testes

Pré-requisito: Node 24 (versão em `.nvmrc`). Todos os comandos rodam na raiz do repositório.

```bash
npm install                    # instala as dependências de todos os pacotes
npm test                       # todos os testes de todos os pacotes
npm run test:coverage          # testes + cobertura; falha se algum pacote ficar abaixo de 80%
npm run lint                   # ESLint
npm run format:check           # Prettier (sem alterar arquivos)
npm run typecheck              # checagem de tipos de todos os pacotes
```

Para rodar só um pacote ou só um arquivo:

```bash
npm test -w apps/server                                          # só o servidor
npm test -w packages/shared                                      # só os contratos
npx vitest run apps/server/test/integration/runoff-flow.test.ts  # só um arquivo
```

Os testes do servidor não precisam de banco, rede nem variáveis de ambiente: usam repositórios em memória, Postgres em memória (`pg-mem`) e relógio e timers falsos. O relatório de cobertura de cada pacote fica em `<pacote>/coverage/` (abra `index.html`).

Para subir a aplicação localmente como em produção (memória no lugar do Postgres):

```bash
npm run build
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm start   # http://localhost:3000
```

Para desenvolver, com recarga automática ao salvar (servidor na porta 3000 e front no Vite, porta 5173):

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm run dev   # http://localhost:5173
```

_Domínio (testes de mutação) e frontend/e2e: a preencher._
