# Aspectos Funcionais — Referências (Doutorado)

Este documento descreve **o que o sistema faz**: capacidades, fluxos e regras de negócio da aplicação de gerenciamento bibliográfico.

## 1. Visão geral

A aplicação **Referências — Doutorado** é um sistema web full-stack para organizar referências bibliográficas em **grupos** (ex.: buscas no Scopus por versão/estratégia). Cada grupo contém **artigos** com metadados BibTeX, anotações, tags e indicadores de uso na revisão de literatura.

O usuário pode:

- Cadastrar e organizar grupos de referências
- Incluir, editar, filtrar e excluir artigos
- Importar e exportar entradas BibTeX
- Marcar artigos como usados ou descartados
- Detectar duplicatas entre grupos
- Visualizar estatísticas por ano
- Acessar PDFs locais vinculados aos artigos
- Trabalhar em múltiplos **workspaces** (bases de dados independentes)

---

## 2. Atores e contexto de uso

| Ator | Descrição |
|------|-----------|
| **Pesquisador** | Usuário principal que gerencia referências da tese/doutorado |
| **Dispositivo (browser)** | Identificado pelo header `X-Device-Id`; associa sessão a workspaces |
| **Sistema de arquivos local** | Fornece PDFs em pastas configuradas (`allowedPdfRoots`) |

---

## 3. Workspaces

Um **workspace** representa um conjunto isolado de dados (banco SQLite + pastas de PDF permitidas).

### 3.1 Funcionalidades

- **Listar workspaces** acessíveis ao dispositivo
- **Criar workspace** com nome, caminho do banco e raízes de PDF
- **Ativar workspace** — troca o contexto de dados da sessão
- **Editar workspace** — altera nome, caminho do banco e pastas permitidas
- **Excluir workspace** — impede exclusão do único workspace do dispositivo
- **Entrar em workspace compartilhado** via token de convite (`POST /api/workspaces/join`)
- **Gerar e revogar tokens** de convite para compartilhar acesso a um workspace

### 3.2 Regras de negócio

- Dispositivo novo sem workspace exige **onboarding** (criar ou entrar com token)
- Ao ativar ou criar workspace, as configurações são sincronizadas com `app.config.json`
- Cada dispositivo mantém lista própria de workspaces aos quais tem acesso

---

## 4. Grupos de referências

Grupos agrupam artigos de uma mesma busca ou estratégia de coleta.

### 4.1 Metadados do grupo

| Campo | Descrição |
|-------|-----------|
| `title` | Nome do grupo |
| `versao` | Versão da estratégia de busca (ex.: `v1`, `v2`) |
| `mecanismo` | Fonte/mecanismo (ex.: Scopus) |
| `stringBusca` | String de busca utilizada |
| `createdAt` | Data de criação |
| `articleCount` | Quantidade de artigos (calculada) |

### 4.2 Operações

- **Criar** grupo com título e metadados opcionais
- **Listar** grupos com contagem de artigos
- **Consultar** metadados de um grupo (sem carregar todos os artigos)
- **Atualizar** título, versão, mecanismo e string de busca
- **Excluir** grupo (cascata: remove todos os artigos associados)
- **Listar tags distintas** do grupo (para filtros na interface)

---

## 5. Artigos bibliográficos

### 5.1 Estrutura de um artigo

| Área | Campos principais |
|------|-------------------|
| **Entrada BibTeX** | `type`, `key`, `fields` (title, author, journal, year, doi, etc.) |
| **Controle de revisão** | `status`, `usado`, `descartado` |
| **Organização** | `tags[]`, `notes`, `source`, `location` |
| **Arquivo** | `caminho` — caminho local do PDF |
| **Duplicatas** | `duplicateOf` — referência ao artigo canônico |

### 5.2 Operações CRUD

- **Criar** artigo manualmente via formulário
- **Consultar** artigo por `groupId` + `key`
- **Atualizar** parcialmente (PATCH) ou completamente (PUT)
- **Excluir** artigo individual
- **Limpar grupo** — remove todos os artigos do grupo, mantendo o grupo

### 5.3 Listagem e filtros

A listagem de artigos é **paginada no servidor** com suporte a:

| Parâmetro | Função |
|-----------|--------|
| `page`, `pageSize` | Paginação |
| `sortBy`, `sortDir` | Ordenação por title, author, year, status, tags, usado, descartado |
| `q` | Busca textual (FTS5) |
| `tags` | Filtro por tags |
| `status` | Filtro por status |
| `usado`, `descartado` | Filtros booleanos |
| `findKey` | Localiza página que contém uma chave específica |

### 5.4 Ações rápidas na interface

- Toggle de **usado** e **descartado** diretamente na tabela
- Navegação para artigo original em entradas marcadas como duplicata
- Seleção de artigo abre formulário lateral de edição

---

## 6. Busca

### 6.1 Busca no grupo

Filtro textual (`q`) aplicado aos artigos do grupo selecionado, com paginação e ordenação.

### 6.2 Busca global

Endpoint `GET /api/search` — busca em **todos os grupos** do workspace ativo usando FTS5, retornando:

- `groupId`, `groupTitle`
- Dados completos do artigo encontrado

---

## 7. Importação e exportação BibTeX

### 7.1 Importação

- Colar ou enviar conteúdo BibTeX para um grupo (`POST /api/groups/:id/import/bibtex`)
- Parser extrai entradas `@article`, `@inproceedings`, etc.
- Resultado informa: importados, ignorados, duplicados e erros de parse
- Opção de registrar **artigo de origem** da importação (`originArticle`)

### 7.2 Exportação

- **Por artigo**: copiar ou baixar BibTeX individual no formulário
- **Por seleção**: exportar artigos por lista de chaves (`POST /api/groups/:id/articles/export`)
- **Artigos usados**: modal dedicado para exportar todos os artigos marcados como `usado` em todos os grupos

---

## 8. Detecção de duplicatas

### 8.1 Critérios

Artigos são considerados duplicatas quando compartilham:

- **DOI** normalizado (case-insensitive, sem prefixo URL), ou
- **Título** normalizado (lowercase, sem acentos, pontuação removida)

### 8.2 Comportamento

- Detecção **entre grupos** da mesma versão (`versao`, padrão `v2`)
- Algoritmo Union-Find agrupa equivalências
- Artigo **canônico** = menor `(groupId, key)` lexicograficamente
- Demais recebem `duplicateOf` apontando para o canônico
- Referências obsoletas são **limpas** quando duplicata deixa de existir
- Acionável via dashboard (`POST /api/stats/detect-duplicates`) ou script CLI

---

## 9. Dashboard e estatísticas

### 9.1 Gráficos por ano

Estatísticas agregadas por grupo e ano de publicação:

| Métrica | Descrição |
|---------|-----------|
| `usados` | Artigos marcados como usados |
| `descartados` | Artigos descartados |
| `outros` | Demais artigos |
| `unicos` | Sem duplicata detectada |
| `repetidos` | Com `duplicateOf` definido |

### 9.2 Funcionalidades do dashboard

- Alternar visualização: **uso** vs **duplicatas**
- Filtrar por versão de busca
- Toggle de visibilidade por segmento do gráfico
- Copiar gráfico como PNG para a área de transferência

---

## 10. Acesso a arquivos PDF

- Artigos podem ter `caminho` apontando para PDF local
- API `GET /api/files/pdf?path=...` serve o arquivo inline
- Validações:
  - Caminho deve estar dentro de `allowedPdfRoots`
  - Arquivo deve ter extensão `.pdf`
  - Arquivo deve existir e ser legível

---

## 11. Configuração

Configurável via `app.config.json`, `.env` ou interface (*Configuração*):

| Parâmetro | Descrição |
|-----------|-----------|
| `sqliteDbPath` | Caminho do banco SQLite |
| `allowedPdfRoots` | Pastas raiz permitidas para servir PDFs |

Alterações via API atualizam o workspace ativo e recarregam a conexão com o banco.

---

## 12. Migração de dados legados

Script de migração converte `referencias.json` (formato antigo) para SQLite:

```powershell
npm run migrate:json -- --source "caminho/referencias.json" --target "data/referencias.db"
```

Preserva grupos e artigos; o JSON original permanece como backup.

---

## 13. Interface do usuário

### 13.1 Layout principal

- **Sidebar**: lista de grupos (criar, renomear, excluir, limpar artigos)
- **Área central**: tabela de artigos ou dashboard
- **Painel lateral**: formulário de criação/edição de artigo
- **Barra de filtros**: busca, tags, status, usado/descartado

### 13.2 Views

| View | Descrição |
|------|-----------|
| **Artigos** | Tabela paginada com filtros e ordenação |
| **Dashboard** | Gráficos estatísticos por ano |

### 13.3 Modais

- Importação BibTeX
- Exportação de artigos usados
- Configuração (caminhos do banco e PDFs)
- Workspaces (criar, ativar, compartilhar)

---

## 14. API REST — resumo

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/health` | Status da API e workspace ativo |
| GET/POST/PUT/DELETE | `/api/workspaces` | Gerenciamento de workspaces |
| POST | `/api/workspaces/join` | Entrar com token |
| GET/PUT | `/api/settings` | Configuração do workspace |
| GET/POST | `/api/groups` | Listar/criar grupos |
| GET/PUT/DELETE | `/api/groups/:id` | CRUD de grupo |
| GET | `/api/groups/:id/tags` | Tags do grupo |
| POST | `/api/groups/:id/import/bibtex` | Importar BibTeX |
| GET/POST/DELETE | `/api/groups/:id/articles` | Listar/criar/limpar artigos |
| POST | `/api/groups/:id/articles/export` | Exportar por chaves |
| GET/PATCH/DELETE | `/api/groups/:groupId/articles/:key` | CRUD de artigo |
| GET | `/api/groups/usado-articles` | Artigos marcados como usados |
| GET | `/api/search` | Busca global FTS |
| GET | `/api/files/pdf` | Servir PDF local |
| GET | `/api/stats/articles-by-year` | Estatísticas por ano |
| POST | `/api/stats/detect-duplicates` | Detectar duplicatas |

---

## 15. Regras de integridade

- Chave de artigo (`entry.key`) é **única por grupo**
- Exclusão de grupo remove artigos em cascata (`ON DELETE CASCADE`)
- Índice FTS é mantido automaticamente por triggers SQLite
- Validação de entrada via schemas Zod na API
- Erros de domínio retornam códigos HTTP apropriados (404, 409, 422)
