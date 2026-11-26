# Deploy em produção (Render + Neon)

Passos que **só o usuário** pode fazer (exigem conta no Neon, no Render e permissão de admin no GitHub). O agente escreveu os arquivos; você executa e confere. Referências: `architecture.md` §12 e §13, `render.yaml` e `.github/workflows/deploy.yml`.

## Como o deploy funciona

```
push na main → CI (lint, testes e build nos 3 SOs) → verde? → workflow "Deploy"
  → POST no Deploy Hook do Render com o commit aprovado (ref=<sha>)
  → Render: npm ci --include=dev && npm run build → npm start → health check em /api/health
```

- O **auto-deploy do Render fica desligado** (`autoDeployTrigger: 'off'` no `render.yaml`). Só o workflow `Deploy` publica, e só depois do CI verde. Ele manda o SHA que o CI aprovou, então um commit mais novo, ainda no CI, não vai junto.
- Um PR **não** publica nada: o `Deploy` só roda para `push` na `main`.
- Na subida, o servidor roda o `migrate` (cria as tabelas se não existirem), semeia o admin e reagenda os prazos das rodadas abertas. Se o banco falhar, o processo cai antes do `listen`, o health check não passa e o Render mantém a versão anterior no ar.

## Limitações que valem para sempre

- **Uma instância só.** A fila de gravações por eleição e as salas do Socket.IO ficam na memória do processo. Com duas instâncias, votos simultâneos voltariam a disputar a mesma versão da eleição, e um celular ligado numa instância não receberia os eventos emitidos pela outra. O `render.yaml` fixa `numInstances: 1`; **não** aumente isso no painel nem ligue o autoscaling.
- **Esquema do banco congelado após o 1º deploy.** O `migrate` só tem `CREATE TABLE IF NOT EXISTS`, que não altera tabela já existente. Qualquer mudança de esquema depois do primeiro deploy precisa de um `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no `migrate`, com teste de que ele roda num banco com o esquema anterior.
- **Plano gratuito.** O Render desliga o serviço depois de 15 minutos sem tráfego, e o 1º acesso seguinte leva cerca de 1 minuto. O Neon também suspende o banco ocioso (a 1ª consulta acorda em menos de 1 segundo). **Antes de uma apresentação, abra `/api/health` alguns minutos antes.** O Render pode reiniciar o serviço a qualquer momento: o estado está no Postgres e os prazos são reagendados na subida.

---

## Checklist

### 1. Criar o banco no Neon

1. Em [neon.tech](https://neon.tech/), crie um projeto (plano Free). Região: **AWS US East (N. Virginia)**, a mesma do serviço no Render (`region: virginia`), para cada consulta não cruzar o continente.
2. Em *Connect*, escolha a conexão **direta** (desligue *Connection pooling*). O servidor já mantém o próprio pool, e com uma instância só o pooler do Neon não ajuda.
3. Copie a *connection string* e troque o final `?sslmode=require&channel_binding=require` por **`?sslmode=verify-full`**. Fica assim:

   ```
   postgresql://<usuario>:<senha>@ep-<nome>.us-east-1.aws.neon.tech/neondb?sslmode=verify-full
   ```

   Motivo: o driver `pg` trata `require` como `verify-full` e avisa que isso vai mudar na próxima versão maior (com `require` passaria a não conferir o certificado). O `channel_binding` o `pg` ignora na URL.

Guarde essa URL: ela é a `DATABASE_URL` do passo 3. É um segredo (tem a senha do banco).

### 2. Integrar o PR na `main`

O Render lê o `render.yaml` da `main`, e o GitHub só roda o workflow `Deploy` a partir do arquivo que está na `main`. Integre o PR desta tarefa primeiro.

> O primeiro `Deploy` depois do merge **vai falhar** com `Secret RENDER_DEPLOY_HOOK is not set`: o serviço e o secret ainda não existem. É esperado; o passo 4 o roda de novo.

### 3. Criar o serviço no Render pelo Blueprint

1. Em [dashboard.render.com](https://dashboard.render.com/): *New → Blueprint*, conecte o repositório `voto` e escolha a branch `main`. O Render encontra o `render.yaml`.
2. Ele pede os valores marcados com `sync: false`:
   - `DATABASE_URL`: a URL do passo 1;
   - `ADMIN_USERNAME`: o usuário do admin (ex.: `admin`);
   - `ADMIN_PASSWORD`: uma senha forte, guardada num gerenciador de senhas.

   O `JWT_SECRET` o Render gera sozinho (256 bits aleatórios). As demais variáveis já vêm do arquivo: `NODE_ENV=production` (obrigatório: é o que exige o segredo e o admin), `REPOSITORY=pg`, `RATE_LIMIT=on` e `TRUST_PROXY_HOPS=3` (medido no passo 6).
3. Aplique o Blueprint. O Render faz o 1º deploy na hora.
4. Confira no serviço:
   - *Settings → Build & Deploy*: **Auto-Deploy = Off**; *Build Command* `npm ci --include=dev && npm run build`; *Start Command* `npm start` (não `node apps/server/dist/main.js`, que não serve o front); *Health Check Path* `/api/health`;
   - *Scaling*: **1 instância**;
   - *Logs* do 1º deploy: o build termina, aparece `Server listening at http://...:10000` (o Render define `PORT=10000`) e **nenhum erro de banco**. É o primeiro uso do `new Pool(...)` real: o `Server listening` só aparece depois que o `migrate` rodou sem erro.

Anote a URL pública do serviço (algo como `https://voto-xxxx.onrender.com`). Nos comandos abaixo, ela é `$URL`:

```bash
URL=https://voto-xxxx.onrender.com
```

> Mudou alguma variável no painel e ela também está no `render.yaml`? Atualize o arquivo no repositório: ao sincronizar o Blueprint, o valor do arquivo sobrescreve o do painel.

### 4. Criar o secret `RENDER_DEPLOY_HOOK` no GitHub

1. No Render: *Settings → Deploy Hook*, copie a URL (`https://api.render.com/deploy/srv-...?key=...`). É um segredo: quem a tiver publica no seu serviço.
2. No GitHub: *Settings → Secrets and variables → Actions → New repository secret*. Nome `RENDER_DEPLOY_HOOK`, valor: a URL **exatamente como copiada** (o workflow acrescenta `&ref=<sha>` no fim).
3. Em *Actions → Deploy*, abra a execução que falhou no passo 2 e clique em *Re-run jobs*. O passo deve terminar com uma resposta `{"deploy":{"id":"dep-..."}}`, e em *Events* do Render aparece um deploy do mesmo commit.

### 5. Conferir `/api/health` e o front

```bash
curl -i $URL/api/health          # 200 {"status":"ok"}
curl -s $URL/api/nothing         # 404 {"error":{"code":"NOT_FOUND",...}}
```

Abra `$URL` no navegador: o front carrega, e `$URL/admin/...` (rota do front) também abre direto, sem 404.

### 6. Confirmar o número de proxies (`TRUST_PROXY_HOPS`)

O rate limit conta tentativas por IP do cliente. Atrás do proxy do Render, o servidor vê o IP do proxy, e o IP do cliente vem no cabeçalho `X-Forwarded-For`. O Render **não apaga** um `X-Forwarded-For` mandado pelo próprio cliente: ele acrescenta entradas ao fim. Por isso o servidor conta `TRUST_PROXY_HOPS` entradas **a partir do fim** e ignora o resto, que o cliente pode ter inventado. A documentação do Render não diz quantas entradas ele acrescenta (relatos da comunidade falam em 1, 2 e 3), então o valor é medido em produção. **Medição de 2026-11-26: `3`** (com `1`, onze logins errados seguidos não geravam `429`). Para conferir de novo:

1. Descubra seu IP público: `curl -s https://ifconfig.me`.
2. Mande uma requisição com um IP falso no cabeçalho e uma marca na URL, para achá-la no log:

   ```bash
   curl -s -H 'X-Forwarded-For: 203.0.113.7' "$URL/api/health?probe=hops"
   ```

3. Em *Logs* do Render, procure a linha `incoming request` com `"url":"/api/health?probe=hops"` e olhe o `remoteAddress` (é o IP que o rate limit usa):
   - **é o seu IP público** → o valor está certo;
   - **é `203.0.113.7`** → o valor está **alto demais** (o cliente escolhe o próprio IP e escapa do limite): diminua 1;
   - **é outro IP** (do Render ou da Cloudflare) → o valor está **baixo demais** (todos os clientes dividem o mesmo limite): aumente 1.
4. Para mudar: *Environment → TRUST_PROXY_HOPS → Save and deploy*; depois do deploy, repita os itens 2 e 3.
5. Com o valor certo, repita a requisição mais 2 ou 3 vezes (o caminho pode passar por servidores diferentes) e uma vez de um celular **no 4G**: cada `remoteAddress` deve ser o IP de quem mandou.
6. Se o valor final for diferente do que está no `render.yaml`, atualize o `TRUST_PROXY_HOPS` lá (ver o aviso do passo 3) e conte ao agente, para ele registrar nas notas da B21.

Contar proxies só é seguro se ninguém chega ao servidor sem passar pelo proxy. No Render isso vale: o serviço só é alcançável pela URL pública (*"Render forwards inbound requests to your web service at this port (it is not directly reachable via the public internet)"*, na página [Web Services](https://render.com/docs/web-services)). A exceção é a rede privada entre serviços da mesma conta e região: não crie lá outro serviço que receba tráfego de terceiros.

### 7. Conferir o rate limit em produção

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
    -d '{"username":"nobody","password":"wrong"}' $URL/api/admin/login
done
```

Esperado: dez `401` e, no 11º, `429`. Logo em seguida, num **segundo aparelho em outra rede** (celular no 4G), faça login como admin pelo front: deve funcionar.

Com o `TRUST_PROXY_HOPS` baixo demais, o servidor conta pelo IP de um proxy, e o sintoma depende de quantos proxies o Render usa: se o IP varia a cada requisição (o que se viu com `1` em 2026-11-26), o 11º login **não** recebe 429; se é sempre o mesmo, o segundo aparelho **também** recebe 429. Nos dois casos, volte ao passo 6.

O limite é por IP: celulares na **mesma** rede Wi-Fi (NAT da universidade) dividem os 60 acessos de eleitor por minuto.

### 8. Conferir uma rodada com vários celulares ao mesmo tempo

Crie uma eleição de teste, credencie uns 5 a 10 eleitores, abra uma rodada e peça para todos votarem ao mesmo tempo. Confira que todos os votos foram contados (a apuração bate com o número de votantes) e que a tela do admin atualizou ao vivo. A rajada de votos simultâneos só foi medida num Postgres local, não no Neon (ver B13b e B17b no `todo-backend.md`).

### 9. Saber que o admin é semeado só na primeira subida

O servidor cria o admin com `ADMIN_USERNAME`/`ADMIN_PASSWORD` **só se esse usuário ainda não existe** no banco. Depois da primeira subida, trocar `ADMIN_PASSWORD` no Render **não muda** a senha guardada.

Para trocar a senha (mantendo o mesmo admin e as eleições dele):

1. Na raiz do repositório, gere o hash da nova senha:

   ```bash
   node -e "require('bcryptjs').hash(process.argv[1], 10).then(console.log)" 'NovaSenhaForte'
   ```

2. No Neon, em *SQL Editor*, rode (com o hash gerado e o seu usuário):

   ```sql
   UPDATE admins SET password_hash = '<hash gerado>' WHERE username = '<ADMIN_USERNAME>';
   ```

3. Atualize também o `ADMIN_PASSWORD` no Render, só para ficar igual (ele não é relido).

Não apague a linha do admin para forçar um novo seed: o admin recriado ganha outro id e perde o acesso às eleições do anterior.

### 10. Conferir que um token assinado com o segredo de desenvolvimento é recusado

O `config.ts` tem um segredo fixo de desenvolvimento (`DEV_JWT_SECRET`), que está no repositório. Em produção ele não pode valer. Na raiz do repositório, gere um token de admin assinado com ele:

```bash
TOKEN=$(node --input-type=module -e "
import { SignJWT } from 'jose';
const key = new TextEncoder().encode('dev-only-jwt-secret-do-not-use-in-production');
console.log(await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' })
  .setSubject('forged-admin').setIssuedAt().setExpirationTime('1h').sign(key));")

curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" $URL/api/elections
```

Esperado: `401` com `INVALID_TOKEN`. (Para comparar: num servidor local em desenvolvimento, `npm run build && npm start`, o mesmo comando contra `http://localhost:3000` responde `200 []`, o que mostra que o token é bem formado e só o segredo o derruba.)

A rota é `GET /api/elections`, e não `GET /api/admin/me`: esta também responde 401 a um token válido de um admin que não existe, então não provaria nada.

### 11. Avisar o agente

Mande ao agente a URL de produção, o valor final do `TRUST_PROXY_HOPS` e o resultado dos passos 5 a 10. Ele registra tudo nas notas da B21 e marca a tarefa como feita (marco M2).

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Build falha com `vite: not found` ou `tsup: not found` | Build Command sem `--include=dev` |
| Deploy falha com `Invalid environment configuration` no log | Variável obrigatória vazia (`JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` ou `DATABASE_URL`) |
| `/api/health` responde, mas `/` dá 404 JSON | Start Command é `node apps/server/dist/main.js` em vez de `npm start` |
| Deploy falha com erro de conexão ou de certificado no banco | `DATABASE_URL` errada, ou sem `sslmode=verify-full` |
| Push na `main` com CI verde e nada publicado | Secret `RENDER_DEPLOY_HOOK` ausente ou errado: veja a execução do workflow `Deploy` em *Actions* |
| 11º login errado seguido não recebe `429` | `TRUST_PROXY_HOPS` baixo demais: o limite conta pelo IP de um proxy, que muda a cada requisição (passo 6) |
| Um IP forjado no `X-Forwarded-For` escapa do limite | `TRUST_PROXY_HOPS` alto demais (passo 6) |
| 1º acesso do dia demora cerca de 1 minuto | Plano gratuito: o serviço dormiu (normal) |
