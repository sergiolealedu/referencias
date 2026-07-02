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
| GET | `/api/groups/:id/articles` | Lista paginada (`page`, `pageSize`, `sortBy`, `sortDir`, filtros) |
| POST | `/api/groups/:id/articles/export` | Exporta artigos por chaves `{ "keys": [...] }` |
| POST | `/api/groups/:id/articles` | Adiciona artigo |
| GET | `/api/groups/:groupId/articles/:key` | Detalhe do artigo |
| PATCH | `/api/groups/:groupId/articles/:key` | Atualização parcial |
| DELETE | `/api/groups/:groupId/articles/:key` | Remove artigo |
| GET | `/api/search` | Busca global paginada com FTS |

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

## Releases e pacotes

### CI contínua

Cada push ou pull request na branch `main` dispara o workflow [CI](.github/workflows/ci.yml), que instala dependências e executa `npm run build`.

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
   - gerar um ZIP de deploy e anexá-lo à [GitHub Release](https://github.com/sergiolealedu/referencias/releases).

Tags pré-release (ex.: `v1.1.0-beta.1`) são marcadas como *pre-release* automaticamente.

### Instalar pacotes da registry

Configure o `.npmrc` (ou copie o arquivo raiz do repositório) e autentique com um [Personal Access Token](https://docs.github.com/pt/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#autenticação) com escopo `read:packages`:

```
@sergiolealedu:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SEU_TOKEN
```

```powershell
npm install @sergiolealedu/referencias-backend@1.0.0
npm install @sergiolealedu/referencias-frontend@1.0.0
```

### Dependabot

Atualizações semanais de dependências npm e GitHub Actions são propostas via [Dependabot](.github/dependabot.yml).
