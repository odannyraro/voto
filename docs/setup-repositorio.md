# Setup do repositório (passos manuais)

Passos que **só o usuário** pode fazer (exigem conta no GitHub e no Codecov). O repositório `odannyraro/voto` já existe. O que pede permissão de **admin** é feito pelo dono ou por quem ele tornar admin.

## 1. Ativar o repositório no Codecov

1. Entre em [codecov.io](https://about.codecov.io/) com a conta do GitHub.
2. Procure o repositório `voto` (hoje ele aparece como **inativo**) e ative-o.
3. Na página do repositório, abra *Configuration → General* e copie o **Repository Upload Token**.

## 2. Criar o secret `CODECOV_TOKEN` no GitHub

1. No repositório: *Settings → Secrets and variables → Actions → New repository secret*.
2. Nome: `CODECOV_TOKEN`. Valor: o token copiado no passo anterior.

O workflow `.github/workflows/ci.yml` lê esse secret. Sem ele, o CI continua verde (o upload falha sem derrubar o job), mas o Codecov não recebe a cobertura.

## 3. (Opcional) Proteger a `main`

1. *Settings → Branches → Add branch ruleset* (ou *branch protection rule*) para `main`.
2. Marque **Require status checks to pass before merging** e escolha os três checks `Verify (ubuntu-latest)`, `Verify (macos-latest)` e `Verify (windows-latest)`. Eles só aparecem na lista depois da primeira execução do CI.
3. Para preservar os commits de cada tarefa, use *merge commit* nos PRs (sem *squash*), como pede o `architecture.md` §12.

## 4. Conferir a primeira execução

Depois do primeiro `push`, abra a aba *Actions* e confira que a matriz (Linux, macOS e Windows) ficou verde e que os 4 uploads do Codecov (`shared`, `domain`, `server`, `web`) aparecem no log do job do Ubuntu. Se algo falhar, cole o log no agente para ele reproduzir e corrigir.

> O teste de mutação (`npm run test:mutation -w packages/domain`) **não** roda no CI porque é lento demais para os 3 sistemas operacionais. Quem cuida do domínio o roda à mão.
