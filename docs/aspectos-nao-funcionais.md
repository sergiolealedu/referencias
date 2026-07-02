# Aspectos Não Funcionais — Referências (Doutorado)

Este documento descreve **como o sistema se comporta** em termos de qualidade, arquitetura, desempenho, segurança e operação — independentemente das funcionalidades específicas.

---

## 1. Arquitetura

### 1.1 Estilo

- **Aplicação web full-stack** com separação clara entre frontend e backend
- **Monorepo npm workspaces** (`backend` + `frontend`)
- Comunicação via **API REST JSON**
- Persistência **local-first** (SQLite no disco do usuário)

### 1.2 Stack tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18, TypeScript, Vite |
| Estado remoto | TanStack React Query |
| Gráficos | Recharts |
| Backend | Node.js, Express, TypeScript |
| Banco | SQLite via `better-sqlite3` |
| Validação | Zod |
| Build | `tsc` (backend), Vite (frontend) |

### 1.3 Topologia de deploy

```
┌─────────────┐     HTTP/JSON      ┌─────────────┐     SQL      ┌──────────────┐
│  Browser    │ ◄────────────────► │  Express    │ ◄──────────► │  SQLite .db  │
│  (React)    │   localhost:5173   │  :3001      │              │  (local)     │
└─────────────┘                    └─────────────┘              └──────────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │  PDFs locais │
                                   │  (filesystem)│
                                   └──────────────┘
```

Em produção, o frontend é servido como build estático; a API permanece em Node.js.

---

## 2. Desempenho

### 2.1 Paginação server-side

- Listagens de artigos **não carregam o dataset completo** no cliente
- Paginação, ordenação e filtros executados no SQLite
- Reduz uso de memória e tempo de resposta para grupos grandes

### 2.2 Indexação

Índices B-tree em:

- `articles(group_id)`
- `articles(group_id, status)`
- `articles(group_id, usado)`

### 2.3 Busca full-text (FTS5)

- Tabela virtual `articles_fts` com tokenizador `unicode61`
- Campos indexados: `entry_key`, `title`, `author`, `journal`, `notes`, `source`, `tags`
- Triggers mantêm índice sincronizado em INSERT/UPDATE/DELETE
- Busca global e filtros `q` utilizam FTS para resposta rápida

### 2.4 Modo WAL

- SQLite configurado com **Write-Ahead Logging**
- Permite leituras concorrentes durante escritas
- Adequado para uso single-user com operações intermitentes

### 2.5 Cache de conexão

- `StoreManager` mantém instância do `SqliteStore` por caminho de banco
- Invalidação ao trocar workspace ou alterar caminho do banco

---

## 3. Escalabilidade e limites

### 3.1 Modelo de uso previsto

- **Single-user / poucos dispositivos** por workspace
- Dados locais, sem cluster ou replicação
- Compartilhamento via tokens de convite (acesso ao mesmo banco)

### 3.2 Limites práticos

| Aspecto | Limite / observação |
|---------|---------------------|
| Payload JSON | 10 MB (`express.json`) |
| Dispositivos | Identificação por header, sem limite formal |
| Workspaces | Ilimitados em teoria; gerenciados em `workspaces.json` |
| Tamanho do banco | Limitado pelo disco local; FTS escala bem para dezenas de milhares de registros |

### 3.3 Não requisitos

- Alta disponibilidade multi-região
- Milhares de usuários simultâneos
- Sharding ou particionamento de dados

---

## 4. Disponibilidade e confiabilidade

### 4.1 Dependências externas

- **Node.js 20+** em runtime
- **Disco local** para banco e PDFs
- Sem dependência de serviços cloud para operação core

### 4.2 Backup

- Função `backupSqliteDatabase` cria cópia timestamped em `{dbDir}/backups/`
- Usa API nativa `better-sqlite3` backup (consistente)
- Migração JSON→SQLite preserva arquivo original

### 4.3 Integridade referencial

- `PRAGMA foreign_keys = ON`
- `UNIQUE(group_id, entry_key)` evita chaves duplicadas no mesmo grupo
- Cascata na exclusão de grupos

### 4.4 Recomendações operacionais

- Manter `.db` em **disco local** (não sincronizar via Google Drive durante uso ativo)
- Evitar corrupção por conflitos de sync em nuvem

---

## 5. Segurança

### 5.1 Modelo de confiança

- Aplicação pensada para **uso local/pessoal**
- API escuta em `localhost` por padrão
- Não há autenticação de usuário (login/senha)

### 5.2 Identificação de dispositivo

- Header `X-Device-Id` identifica o browser/dispositivo
- Registro automático na primeira requisição
- Controle de acesso a workspaces por dispositivo

### 5.3 Tokens de convite

- Tokens gerados para compartilhar workspace entre dispositivos
- Revogáveis individualmente
- Sem expiração automática documentada (persistidos no registry)

### 5.4 Proteção de arquivos

- Servir PDFs **restrito** a caminhos dentro de `allowedPdfRoots`
- Normalização e resolução de path impedem path traversal básico
- Apenas arquivos `.pdf` são servidos

### 5.5 Validação de entrada

- Schemas Zod em todas as rotas de escrita
- Erros 400 com detalhes estruturados (`error.flatten()`)
- Erros de domínio mapeados para HTTP (404, 409, 422)

### 5.6 CORS

- Habilitado globalmente (`cors()`) — adequado para dev local
- Em produção exposta, revisar origens permitidas

---

## 6. Usabilidade

### 6.1 Interface

- Layout responsivo com sidebar, tabela e painel lateral
- Ações frequentes acessíveis (toggle usado/descartado na tabela)
- Confirmação antes de ações destrutivas (limpar grupo)
- Feedback de erro em formulários e operações assíncronas

### 6.2 Produtividade

- Filtros persistentes por sessão de navegação
- `findKey` posiciona automaticamente na página do artigo buscado
- Navegação cross-grupo para artigos duplicados
- Exportação BibTeX com um clique (copiar/baixar)
- Importação em lote via colagem de BibTeX

### 6.3 Idioma

- Interface e mensagens em **português brasileiro**
- Ordenação de chaves com locale `pt-BR`

---

## 7. Manutenibilidade

### 7.1 Organização do código

```
backend/src/
├── routes/          # Endpoints REST
├── store/           # Persistência SQLite
├── schemas/         # Validação Zod
├── utils/           # BibTeX, duplicatas
├── middleware/      # Autenticação de dispositivo
└── types/           # Contratos TypeScript

frontend/src/
├── components/      # UI React
├── hooks/           # React Query
├── api/             # Cliente HTTP
└── utils/           # BibTeX, gráficos, versões
```

### 7.2 Tipagem

- TypeScript end-to-end
- Tipos compartilhados/convergentes entre frontend e backend (`Article`, `GroupMeta`, etc.)

### 7.3 Separação de responsabilidades

- Rotas delegam para `SqliteStore`
- Mapeamento DB↔domínio em `articleMapper.ts`
- Queries complexas isoladas em `articleQuery.ts`
- Erros de persistência encapsulados em `StoreError`

### 7.4 Scripts utilitários

- `migrate-json-to-sqlite.ts` — migração de dados legados
- `detect-duplicates.ts` — detecção via CLI
- `clean-authors.ts` — manutenção de dados

---

## 8. Portabilidade

### 8.1 Plataformas

- Desenvolvido e testado em **Windows** (paths com `\` e `/` tratados)
- Node.js cross-platform
- Caminhos configuráveis via JSON/env

### 8.2 Configuração

Prioridade de configuração:

1. Variáveis de ambiente (`.env`) — sobrescrevem
2. `app.config.json` — editável pela UI
3. Defaults do bootstrap (ex.: `data/referencias.db`)

---

## 9. Observabilidade

### 9.1 Health check

`GET /api/health` retorna:

```json
{
  "status": "ok",
  "dbPath": "...",
  "workspaceId": "...",
  "workspaceName": "..."
}
```

### 9.2 Logging

- Erros não tratados logados no console (`console.error`)
- Middleware global retorna 500 genérico ao cliente
- Sem integração com Sentry/monitoramento externo

### 9.3 Métricas

- Não há coleta automática de métricas de performance
- Estatísticas de negócio disponíveis via `/api/stats/*`

---

## 10. Compatibilidade

### 10.1 Pré-requisitos de runtime

| Componente | Versão mínima |
|------------|---------------|
| Node.js | 20+ |
| npm workspaces | 7+ |

### 10.2 Formato de dados

- **BibTeX** — parser próprio com normalização de campos
- **SQLite 3** — schema versionado em `schema.sql`
- **JSON legado** — suportado via script de migração

### 10.3 Browser

- SPA moderna (ES modules, React 18)
- Requer browser com suporte a fetch, clipboard API (exportação de gráficos)

---

## 11. Testabilidade

### 11.1 Estado atual

- Banco de teste em `backend/data/test-referencias.db`
- Scripts CLI permitem testar lógica de duplicatas e migração isoladamente
- Sem suite automatizada de testes unitários/integração documentada

### 11.2 Facilidades para testes

- Store desacoplado das rotas (injetado via middleware)
- Validação Zod testável independentemente
- Funções puras em `duplicateDetection.ts` e `bibtexParser.ts`

---

## 12. Evolução e extensibilidade

### 12.1 Pontos de extensão

- Novos campos BibTeX via `fields` dinâmico (JSON)
- Novos filtros/ordenações em `ArticleListParams`
- Novos workspaces sem alterar schema global
- Versões de busca (`versao`) permitem comparar estratégias no dashboard

### 12.2 Migração histórica

- Sistema migrou de JSON monolítico para SQLite paginado
- `GroupMeta` substitui `Group` com artigos embutidos (deprecated)
- Bootstrap automático cria workspace a partir de `app.config.json` legado

---

## 13. Requisitos não funcionais — resumo

| Categoria | Requisito | Prioridade |
|-----------|-----------|------------|
| **Desempenho** | Listagens paginadas < 500 ms para grupos típicos | Alta |
| **Desempenho** | Busca FTS responsiva em milhares de registros | Alta |
| **Confiabilidade** | Integridade referencial SQLite | Alta |
| **Confiabilidade** | Backup manual/scripted do banco | Média |
| **Segurança** | Restrição de paths para PDFs | Alta |
| **Segurança** | Validação de entrada em todas as escritas | Alta |
| **Usabilidade** | Interface em português, fluxos de revisão eficientes | Alta |
| **Manutenibilidade** | TypeScript + separação store/routes/schemas | Alta |
| **Portabilidade** | Windows + paths configuráveis | Média |
| **Escalabilidade** | Single-user, dados locais | Adequado ao escopo |
| **Disponibilidade** | Offline-first (sem internet necessária) | Alta |
| **Observabilidade** | Health check + logs de console | Básica |
