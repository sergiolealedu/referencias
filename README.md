# Referências — Doutorado

Aplicação web full-stack com persistência SQLite para gerenciar grupos e artigos bibliográficos.

## Pré-requisitos

- Node.js 20+
- Banco SQLite local (caminho configurável em `app.config.json`)

## Configuração

1. Copie o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
Copy-Item app.config.example.json app.config.json
```

2. Ajuste os caminhos em `app.config.json` ou no `.env`:

**`app.config.json`** (recomendado — também editável pela interface em *Configuração*):

```json
{
  "sqliteDbPath": "data/referencias.db",
  "allowedPdfRoots": ["G:\\Meu Drive\\doutorado"]
}
```

**`.env`** (opcional; sobrescreve `app.config.json`):

```
SQLITE_DB_PATH=C:\dados\referencias.db
ALLOWED_PDF_ROOTS=G:\Meu Drive\doutorado
PORT=3001
```

3. Instale as dependências:

```powershell
npm install
```

## Migração do JSON legado

Se você ainda tem dados em `referencias.json`:

```powershell
cd backend
npm run migrate:json -- --source "G:\Meu Drive\doutorado\app\referencias.json" --target "data\referencias.db"
```

Atualize `sqliteDbPath` em `app.config.json` para apontar ao `.db` criado. O arquivo JSON original permanece como backup.

## Execução

Desenvolvimento (API + frontend em paralelo):

```powershell
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

Build de produção:

```powershell
npm run build
npm start
```

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/groups` | Lista grupos com contagem de artigos |
| POST | `/api/groups` | Cria grupo |
| GET | `/api/groups/:id` | Metadados do grupo (sem artigos) |
| GET | `/api/groups/:id/tags` | Tags distintas do grupo |
| PUT | `/api/groups/:id` | Atualiza grupo |
| DELETE | `/api/groups/:id` | Remove grupo |
| GET | `/api/groups/:id/export` | Exporta grupo completo (metadados + todos os artigos) em JSON |
| POST | `/api/groups/import` | Importa pacote exportado (`formatVersion: 1`) — cria grupo novo ou mescla em existente |
| POST | `/api/groups/:id/import/bibtex` | Importa entradas BibTeX no grupo |
| GET | `/api/groups/:id/articles` | Lista paginada (`page`, `pageSize`, `sortBy`, `sortDir`, filtros) |
| POST | `/api/groups/:id/articles/export` | Exporta artigos por chaves `{ "keys": [...] }` |
| POST | `/api/groups/:id/articles` | Adiciona artigo |
| GET | `/api/groups/:groupId/articles/:key` | Detalhe do artigo |
| PATCH | `/api/groups/:groupId/articles/:key` | Atualização parcial |
| DELETE | `/api/groups/:groupId/articles/:key` | Remove artigo |
| GET | `/api/search` | Busca global paginada com FTS |
| GET | `/api/sync/status` | Status de sync (última alteração, workspace) |
| GET | `/api/sync/pull?since=` | Pull incremental para app mobile |
| POST | `/api/sync/push` | Push de alterações do app mobile |

## Persistência

O `SqliteStore` usa SQLite com:

- Modo WAL para leituras/escritas concorrentes
- Índices em `group_id`, `status` e `usado`
- FTS5 para busca textual (`q`)
- Paginação e ordenação no servidor

Recomenda-se manter o `.db` em disco local (não sincronizar via Google Drive em uso ativo).

## Interface

- Sidebar com grupos (criar, renomear, excluir)
- Tabela de artigos com busca, filtros e paginação server-side
- Formulário lateral para criar/editar artigos
- Toggle rápido de `usado` e `descartado` na tabela
- Link para artigo original em entradas duplicadas
- Importação BibTeX por grupo
- Exportar / importar grupo completo entre servidores (JSON)
- **Acesso ao workspace** — convites por token, troca de workspace (botão com nome do workspace)
- **Configuração** — caminhos globais de banco SQLite e PDF (`app.config.json`), válidos para todos os workspaces

## Acesso ao workspace

O controle de acesso é por **dispositivo** (navegador), não por usuário/senha. Cada workspace tem seus próprios caminhos de banco e PDFs; quem tem acesso pode convidar outros dispositivos.

### Primeiro acesso (servidor novo)

Quando nenhum dispositivo ainda entrou no workspace:

1. Ao iniciar a API, o servidor gera um **token de convite** e o exibe nos logs (`pm2 logs referencias-api`).
2. Abra a aplicação no navegador — a tela inicial oferece **Obter acesso inicial**.
3. Use o mesmo token em outros dispositivos (botão *Copiar token*) ou gere novos tokens em **Acesso** após entrar.

Em servidor sem interface, gere um token manualmente:

```bash
sudo bash /opt/referencias/scripts/migrate/create-join-token.sh
```

### Convidar outro dispositivo

1. Clique em **Acesso · &lt;workspace&gt;** no cabeçalho.
2. Em *Convidar outro dispositivo*, gere um token e envie ao colega.
3. No outro dispositivo: tela inicial → **Entrar com token** (ou onboarding).

### Configuração global

Somente o **administrador da instalação** (primeiro dispositivo que obteve acesso) vê o botão **Configuração** e pode alterar caminhos de banco SQLite e pastas de PDF em `app.config.json`.

Demais membros do workspace usam os artigos normalmente e podem **gerar tokens** para convidar outros dispositivos, mas não alteram a configuração global.

### API de acesso

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/workspaces/setup` | Status de onboarding e token inicial (se aplicável) |
| POST | `/api/workspaces/join` | Entrar com token `{ "token": "ws_..." }` |
| POST | `/api/workspaces/:id/tokens` | Gerar token de convite |
| GET | `/api/workspaces/:id/tokens` | Listar tokens ativos |
| DELETE | `/api/workspaces/:id/tokens/:token` | Revogar token |
| GET/PUT | `/api/settings` | Caminhos do workspace ativo (membros) |

## Transferência de grupo entre servidores

Use esta funcionalidade para mover um grupo inteiro de uma instância para outra (ex.: produção → local, ou backup em outro ambiente).

### Exportar (servidor de origem)

1. Selecione o grupo na sidebar.
2. Clique em **Exportar grupo** no cabeçalho do painel.
3. Salve o arquivo `.json` gerado (contém metadados, artigos, tags, status, `usado`, `descartado`, etc.).

Via API:

```powershell
curl -H "X-Auth-Token: SEU_TOKEN" http://localhost:3001/api/groups/123/export -o grupo-123.json
```

### Importar (servidor de destino)

1. Clique em **Importar grupo** no cabeçalho do painel.
2. Selecione o arquivo `.json` exportado.
3. Escolha o destino:
   - **Criar novo grupo** — gera um novo ID no servidor de destino;
   - **Mesclar em grupo existente** — adiciona artigos ao grupo escolhido (ignorar ou substituir chaves duplicadas).
4. Ajuste o título, se necessário, e confirme.

Via API:

```powershell
curl -X POST http://localhost:3001/api/groups/import `
  -H "Content-Type: application/json" `
  -H "X-Auth-Token: SEU_TOKEN" `
  -d "@grupo-123.json"
```

O body aceita o JSON exportado com um campo opcional `options`:

```json
{
  "formatVersion": 1,
  "exportedAt": "2026-07-03T10:00:00.000Z",
  "group": { "title": "...", "versao": "v2", "mecanismo": "Scopus", "stringBusca": "", "createdAt": "...", "sourceId": 123 },
  "articles": [ ... ],
  "options": {
    "title": "Título no destino",
    "targetGroupId": 456,
    "onConflict": "skip"
  }
}
```

`onConflict`: `skip` (padrão) ou `replace`. Referências `duplicateOf` entre grupos são removidas na importação, pois os IDs de grupo diferem entre servidores.

## Releases e pacotes

### CI contínua

Cada push ou pull request na branch `main` dispara o workflow [CI](.github/workflows/ci.yml), que:

- instala dependências e executa `npm run build`;
- valida o build Android de release (`bundleRelease` + `assembleRelease`) com Capacitor + Gradle.

### App Android (Capacitor)

Build local (requer [Android SDK](https://developer.android.com/studio) e `ANDROID_HOME`):

```powershell
npm run build:android
npm run android:release -w frontend
```

Artefatos em `frontend/android/app/build/outputs/`.

Para assinar releases localmente, copie `frontend/android/keystore.properties.example` para `keystore.properties` e coloque o `.jks` na pasta `frontend/android/`.

#### Secrets para release assinado no GitHub

Configure em *Settings → Secrets and variables → Actions*:

| Secret | Descrição |
|--------|-----------|
| `ANDROID_KEYSTORE_BASE64` | Conteúdo do `.jks` em Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Senha do keystore |
| `ANDROID_KEY_ALIAS` | Alias da chave |
| `ANDROID_KEY_PASSWORD` | Senha da chave |

Gerar Base64 do keystore (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("caminho\referencias-release.jks"))
```

Sem esses secrets, o workflow ainda gera `.aab`/`.apk`, porém sem assinatura de release.

### Publicar uma release

1. Garanta que `main` está estável (CI verde).
2. Crie e envie uma tag semver:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

3. O workflow [Release](.github/workflows/release.yml) irá:
   - compilar backend e frontend;
   - publicar `@sergiolealedu/referencias-backend` e `@sergiolealedu/referencias-frontend` no [GitHub Packages](https://github.com/sergiolealedu/referencias/pkgs/npm/referencias-backend);
   - gerar o app Android (`.aab` e `.apk`) com Capacitor;
   - gerar um ZIP de deploy e anexar tudo à [GitHub Release](https://github.com/sergiolealedu/referencias/releases).

Tags pré-release (ex.: `v1.1.0-beta.1`) são marcadas como *pre-release* automaticamente.

### Instalar pacotes da registry

Configure o `.npmrc` (ou copie o arquivo raiz do repositório) e autentique com um [Personal Access Token](https://docs.github.com/pt/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#autenticação) com escopo `read:packages`:

```
@sergiolealedu:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SEU_TOKEN
```

```powershell
npm install @sergiolealedu/referencias-backend@1.1.0
npm install @sergiolealedu/referencias-frontend@1.1.0
```

### Dependabot

Atualizações semanais de dependências npm e GitHub Actions são propostas via [Dependabot](.github/dependabot.yml).
