# Scripts — guia resumido

Wrappers na raiz do repositório. Todos funcionam **de qualquer pasta** (usam o caminho do próprio script, não o diretório atual).

Substitua `C:\tmp2\exemplos\doutorado\refs` pelo caminho real do seu clone, se for diferente.

## Pré-requisito: `deploy.txt`

Deploy, backup e restore leem credenciais em `deploy.txt` na raiz do repo:

```
senha: SUA_SENHA
ip do servidor: 159.223.130.39
usuario: root
branch: main
app_dir: /opt/referencias
```

Campos opcionais: `usuario`, `branch`, `app_dir`, `pm2_app`, `domain`. **Nunca commite** este arquivo.

---

## `install-server.ps1`

Instalação inicial em **servidor Ubuntu zerado** via SSH (sem abrir sessão SSH manual). Envia `digitalocean-install.sh` do seu clone, instala Node/Nginx/PM2, clona o repo e faz build.

**Pré-requisitos:** `deploy.txt`, Python 3 + `pip install paramiko`, servidor Ubuntu 22.04/24.04 com SSH como `root` (ou usuário com sudo).

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\install-server.ps1 -SkipConfirm
```

Ou:

```powershell
cd C:\tmp2\exemplos\doutorado\refs
npm run install:server
```

Com domínio e HTTPS (Let's Encrypt):

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\install-server.ps1 `
  -Domain ref.sergioleal.org `
  -InstallCertbot `
  -CertbotEmail admin@exemplo.org `
  -SkipConfirm
```

Reinstalar mesmo com API já saudável:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\install-server.ps1 -Force -SkipConfirm
```

**Após instalar** (servidor novo, dados vazios):

1. `npm run restore:server` — traz backup do servidor antigo, ou  
2. `npm run publish:server` / `release.ps1` — só atualiza código.

O script **não** restaura banco/PDFs; use `backup-server.ps1` para isso.

---

## `commit-push.ps1`

Commit das alterações locais + push para o origin. Bloqueia arquivos sensíveis (`.env`, `deploy.txt`, etc.).

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\commit-push.ps1 -Message "Corrige filtro de tags no grupo"
```

Só commit, sem push:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\commit-push.ps1 -Message "WIP: ajuste sidebar" -SkipPush
```

Sem confirmação interativa:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\commit-push.ps1 -Message "Atualiza dependências" -SkipConfirm
```

---

## `release.ps1`

Pipeline completo: build local → APK Android → commit/push → publicação no servidor.

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\release.ps1 -Message "Release 1.2.0" -SkipConfirm
```

Só build e commit, sem publicar no servidor:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\release.ps1 -Message "Release 1.2.0" -SkipConfirm -SkipPublish
```

Sem APK Android:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\release.ps1 -Message "Hotfix API" -SkipConfirm -SkipMobile
```

APK em outra pasta:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\release.ps1 -Message "Release 1.2.0" -SkipConfirm -ApkDestination "D:\apk"
```

---

## `build-android-apk.ps1`

Compila o app Android (Capacitor + Gradle) e copia o APK para a pasta de destino.

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\build-android-apk.ps1
```

Destino customizado:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\build-android-apk.ps1 -Destination "G:\Meu Drive\doutorado\app"
```

APK debug (mais rápido, sem assinatura release):

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\build-android-apk.ps1 -Debug
```

Pular sync Capacitor (só recompila o APK):

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\build-android-apk.ps1 -SkipSync
```

Requer Android SDK (`ANDROID_HOME`).

---

## `backup-server.ps1`

Backup, restore e listagem dos dados do servidor via SSH (banco, registry, workspaces, PDFs).

**Backup** (pasta padrão: `G:\Meu Drive\doutorado\app\backup\server-YYYYMMDD-HHmmss\`):

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1 -SkipConfirm
```

Backup sem PDFs:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1 -SkipConfirm -ExcludePdfs
```

Backup em outra pasta:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1 -SkipConfirm -BackupDir "D:\backups\refs"
```

**Listar** snapshots disponíveis:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1 -Action List
```

**Restaurar** o backup mais recente:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1 -Action Restore -Latest -SkipConfirm
```

Restaurar um snapshot específico:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1 -Action Restore -BackupDir "G:\Meu Drive\doutorado\app\backup\server-20260704-143015" -SkipConfirm
```

---

## Scripts em `scripts/` (sem wrapper na raiz)

### Publicar no servidor

Pull, build e restart PM2 — usa `deploy.txt`:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\scripts\deploy\publish-to-server.ps1 -SkipConfirm
```

Sem git push (só atualiza o que já está no remoto):

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\scripts\deploy\publish-to-server.ps1 -SkipConfirm -SkipPush
```

### Migrar dados local → servidor

Envia banco SQLite (e opcionalmente PDFs). **Feche a API local antes.**

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\scripts\migrate\local-to-server.ps1 -ServerHost ref.sergioleal.org -SkipConfirm
```

Com PDFs:

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\scripts\migrate\local-to-server.ps1 -ServerHost ref.sergioleal.org -IncludePdfs -SkipConfirm
```

Só o banco (workspace vazio no servidor):

```powershell
powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\scripts\migrate\upload-db-only.ps1 -ServerHost ref.sergioleal.org
```

### QA do corpus

Roda sobre o snapshot de backup mais recente (somente leitura — nunca no banco de produção):

```powershell
python scripts/qa/audit-snapshot.py
```

Confere se algum PDF anexado é de outro artigo (precisa de snapshot **com** PDFs):

```powershell
python scripts/qa/check-pdf-content.py
```

Prepara o material de releitura dos artigos rejeitados:

```powershell
python scripts/qa/extract-triage-digest.py
```

Grava no servidor as notas e correções revisadas — dry-run sem `--apply`:

```powershell
python scripts/qa/apply-patches.py --input data/qa/<stamp>/notas-propostas.json
```

Detalhes e parâmetros: [`scripts/README.md`](scripts/README.md).

### PDF dos achados (catálogo de fatores)

Gera `docs/achados-fatores-qvt.pdf`: cada fator com a descrição e, por artigo
ligado, a polaridade, o termo do artigo e a citação; no fim, as referências com
os fatores que cada uma sustenta. Por padrão lê o backup congelado
`server-20260924-162133` (somente leitura, o arquivo não é alterado):

```powershell
python scripts/docs/achados-fatores-pdf.py
```

Outro banco ou outra saída: `--db <caminho>\referencias.db --out <arquivo>.pdf`.
Requer `reportlab` e as fontes Calibri do Windows.

Para a etapa 2 (práticas de ESC × fatores), `docs/achados-esc-etapa2.pdf` junta
a triagem dos abstracts (`docs/esc/triagem-busca1.json`) e os elos prática → fator
extraídos do texto completo (`docs/esc/efeitos-texto-busca1.json`, formato da
skill `analise-esc-fatores`):

```powershell
python scripts/docs/achados-esc-pdf.py
```

### Títulos colados → BibTeX (fallback)

Para quando não sai arquivo nenhum da base: cola-se uma lista de títulos (um por
linha) e o Crossref completa os metadados.

```powershell
node scripts/crossref-bibtex.mjs titulos.txt
```

Gera `titulos.bib` e `titulos.casamento.md`. **Leia o relatório antes de
importar**: o casamento é por similaridade de título, e as linhas `media`/`baixa`
precisam de olho humano.

### Servidor Linux (bash)

Instalação inicial no Droplet (alternativa manual, já logado no servidor):

```bash
sudo bash /opt/referencias/scripts/deploy/digitalocean-install.sh
```

**Preferível da máquina local:** `install-server.ps1` ou `npm run install:server` (ver seção acima).

Importar pacote em `/tmp/referencias-migrate/`:

```bash
sudo bash /opt/referencias/scripts/migrate/import-on-server.sh
```

Substituir só o `referencias.db`:

```bash
sudo bash /opt/referencias/scripts/migrate/import-db-only.sh
```

Gerar token de convite para entrar no workspace:

```bash
sudo bash /opt/referencias/scripts/migrate/create-join-token.sh
sudo bash /opt/referencias/scripts/migrate/create-join-token.sh tese-do-sergio
```

Token de convite em ambiente local:

```powershell
node C:\tmp2\exemplos\doutorado\refs\scripts\migrate\gen-token-local.mjs tese-do-sergio
```
