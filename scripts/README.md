# `scripts/` — referência completa

Esta pasta contém a **implementação** dos scripts de build, deploy, backup e migração.
Os arquivos `.ps1` na **raiz** do repositório (`install-server.ps1`, `commit-push.ps1`,
`release.ps1`, `build-android-apk.ps1`, `backup-server.ps1`) são apenas *wrappers* finos:
resolvem a raiz do repo e encaminham para os scripts daqui.

- Guia rápido de uso do dia a dia: [`../SCRIPTS.md`](../SCRIPTS.md)
- Este arquivo: **todos** os scripts, incluindo os internos, com parâmetros, variáveis de
  ambiente e riscos.

Todos os scripts funcionam de qualquer diretório — resolvem a raiz do repo a partir do
próprio caminho (`$PSScriptRoot` / `import.meta.url`), não do diretório atual.

---

## Mapa rápido

| Quero… | Use |
|---|---|
| Instalar do zero num Ubuntu novo | `npm run install:server` |
| Publicar o código atual em produção | `npm run publish:server` |
| Pipeline completo (build + APK + commit + deploy) | `npm run release:server` |
| Fazer backup dos dados do servidor | `npm run backup:server` |
| Restaurar backup no servidor | `npm run restore:server` ⚠️ |
| Listar backups existentes | `npm run backup:server:list` |
| Gerar APK e copiar pro Drive | `npm run build:android:copy` |
| Mandar o banco local pro servidor | `scripts/migrate/local-to-server.ps1` ⚠️ |
| Gerar token de convite | `scripts/migrate/create-join-token.sh` (servidor) |

---

## Convenções e pré-requisitos

### `deploy.txt` (raiz do repo)

Lido por `deploy/publish-to-server.ps1`, `deploy/install-server.ps1` e
`backup/server-data.ps1`. Formato `chave: valor`, comentários com `#` ou `;`.
Modelo em [`../deploy.txt.example`](../deploy.txt.example). **Nunca commite** — o
`commit-and-push.ps1` bloqueia explicitamente.

| Chave | Aliases | Padrão | Obrigatória |
|---|---|---|---|
| `senha` | `password`, `pass` | — | ✅ |
| `ip do servidor` | `ip`, `host`, `servidor`, `server` | — | ✅ |
| `usuario` | `user`, `ssh_user` | `root` | |
| `branch` | | `main` | |
| `app_dir` | `app dir` | `/opt/referencias` | |
| `pm2_app` | `pm2 app` | `referencias-api` | |
| `app_user` | `app user` | `referencias` | |
| `pdf_dir` | `pdf dir` | `/var/lib/referencias/pdfs` | |
| `domain` | `dominio`, `domínio` | `_` (serve por IP) | |

### `app.config.json` (raiz do repo)

Lido pelos scripts de `migrate/`. Chaves usadas: `sqliteDbPath` e `allowedPdfRoots`.

### Ferramentas

| Script | Precisa de |
|---|---|
| `deploy/*.ps1`, `backup/server-data.ps1` | PowerShell 5.1+, Python 3 (`python` ou `python3`) com **`paramiko`** (`pip install paramiko`) |
| `migrate/*.ps1` | `ssh`, `scp`, `robocopy` no PATH e **acesso SSH por chave** (esses não usam `deploy.txt`) |
| `android/*`, `*.mjs` de Android | Node + npm, Android SDK (`ANDROID_HOME` ou `ANDROID_SDK_ROOT`), Java/Gradle |
| `*.sh` de `migrate/` e `deploy/` | Rodam **no servidor Linux**, como `root` |

> ⚠️ Todos os helpers Python usam `paramiko.AutoAddPolicy()` — aceitam qualquer host key,
> sem verificação MITM — e recebem a senha SSH por variável de ambiente.

---

## `deploy/` — publicação e provisionamento

### `publish-to-server.ps1`

Sincroniza a versão, faz push do branch atual e atualiza produção
(`git pull` → `npm ci` → `npm run build` → `pm2 restart`).

```powershell
npm run publish:server
# ou
powershell -ExecutionPolicy Bypass -File .\scripts\deploy\publish-to-server.ps1 -SkipConfirm
```

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-DeployFile <path>` | `<raiz>\deploy.txt` | Arquivo de credenciais |
| `-SkipPush` | off | Não faz push; publica o que já está no remoto |
| `-AllowDirty` | off | Permite publicar com alterações não commitadas |
| `-SkipConfirm` | off | Sem prompt |
| `-RepoRoot <path>` | auto | Raiz do repo |

Antes de publicar roda `node scripts/sync-package-version.mjs`; se os `package.json` ou o
`build.gradle` mudarem, cria automaticamente um commit `chore: sync version to vX.Y.Z`.

> ⚠️ Se o branch de `deploy.txt` diferir do branch em que você está, o script **publica o
> branch atual** (só emite um aviso). Confira `git branch` antes.

### `release.ps1`

Pipeline completo em 4 etapas: `npm run build` → APK Android → commit/push → publicação.
O wrapper da raiz [`../release.ps1`](../release.ps1) aponta pra cá.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy\release.ps1 -Message "Release 1.2.0" -SkipConfirm
```

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-Message <texto>` | `''` | Mensagem do commit |
| `-SkipBuild` | off | Pula o `npm run build` |
| `-SkipMobile` | off | Pula a geração do APK |
| `-SkipCommit` | off | Pula sync de versão + commit/push |
| `-SkipPublish` | off | Pula o deploy no servidor |
| `-ApkDestination <path>` | `G:\Meu Drive\doutorado\app` | Destino do APK |
| `-DeployFile <path>` | `<raiz>\deploy.txt` | Repassado ao publish |
| `-AllowDirty` | off | Não exige árvore limpa |
| `-SkipConfirm` | off | Sem prompt |

> ⚠️ `Invoke-ChildScript` testa `$?` e não `$LASTEXITCODE` — um script filho que falhe sem
> lançar exceção pode não abortar o pipeline. Confira a saída.

### `commit-and-push.ps1`

`git add -A` → commit → push do branch atual. Chamado pelo wrapper
[`../commit-push.ps1`](../commit-push.ps1) e pela etapa 3 do `release.ps1`.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy\commit-and-push.ps1 -Message "Corrige filtro de tags"
```

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-Message <texto>` | pergunta | Mensagem; obrigatória junto com `-SkipConfirm` |
| `-SkipPush` | off | Só commita |
| `-SkipConfirm` | off | Sem prompt |

**Proteção de segredos:** aborta se o stage contiver `deploy.txt`, `.env`, `.env.*`,
`credentials.json`, `secrets.json`, `id_rsa`, `id_ed25519` ou caminhos sob
`/.env/`, `/credentials/`, `/secrets/`.

### `install-server.ps1`

Provisiona um Ubuntu zerado a partir do Windows: envia o `digitalocean-install.sh` por
SFTP e o executa via SSH. Wrapper: [`../install-server.ps1`](../install-server.ps1).

```powershell
npm run install:server
# com domínio e HTTPS
powershell -ExecutionPolicy Bypass -File .\scripts\deploy\install-server.ps1 `
  -Domain ref.sergioleal.org -InstallCertbot -CertbotEmail admin@exemplo.org -SkipConfirm
```

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-Domain <fqdn>` | `deploy.txt` → `_` | `server_name` do Nginx |
| `-InstallCertbot` | off | Emite certificado Let's Encrypt (exige `-CertbotEmail` e domínio real) |
| `-CertbotEmail <email>` | `''` | E-mail do certificado |
| `-Force` | off | Reinstala mesmo com `/api/health` respondendo |
| `-DeployFile <path>` | `<raiz>\deploy.txt` | Credenciais |
| `-SkipConfirm` | off | Sem prompt |

Sem `-Force`, se o servidor já estiver instalado e saudável o helper devolve **código 3** e
não faz nada. O script **não restaura banco nem PDFs** — para isso use
`npm run restore:server`.

### `digitalocean-install.sh` 🐧

Provisionamento propriamente dito. Roda **no servidor**, como root. Normalmente é enviado
pelo `install-server.ps1`; também pode ser rodado à mão:

```bash
sudo bash /opt/referencias/scripts/deploy/digitalocean-install.sh
```

Sem argumentos de linha de comando — configura-se por variáveis de ambiente:
`APP_DIR` (`/opt/referencias`), `APP_USER` (`referencias`), `GIT_REPO`, `GIT_BRANCH` (`main`),
`DOMAIN` (`_`), `PORT` (`3001`), `SQLITE_DB_PATH` (`data/referencias.db`),
`ALLOWED_PDF_ROOTS` (`/var/lib/referencias/pdfs`), `INSTALL_CERTBOT` (`false`),
`CERTBOT_EMAIL`, `SKIP_APT` (`false`), `SKIP_CLONE` (`false`), `NODE_MAJOR` (`20`).

Instala apt/Node/Nginx/PM2/UFW, cria o usuário do app, clona o repo, escreve
`app.config.json` e `.env`, builda, sobe o PM2, configura o vhost e faz health check.

> 🔴 **Destrutivo.** `rm -rf "${APP_DIR:?}"/*` quando não existe `${APP_DIR}/.git`;
> `ufw --force reset` (apaga todas as regras de firewall); sobrescreve `app.config.json`,
> `.env` e o vhost do Nginx a **cada** execução; remove `/etc/nginx/sites-enabled/default`;
> dá `pm2 delete` antes de subir. Só rode em servidor novo ou com `-Force` consciente.

### Helpers Python (uso interno)

Não têm CLI — leem tudo de variáveis de ambiente exportadas pelos `.ps1`.
Rodar à mão exige exportar as variáveis manualmente.

| Arquivo | Chamado por | O que faz no servidor |
|---|---|---|
| `install-server-remote.py` | `install-server.ps1` | Sobe `digitalocean-install.sh` para `/tmp/referencias-install.sh`, executa, apaga, faz health check. Sai com **3** se já instalado e `INSTALL_FORCE` não estiver setado |
| `publish-to-server-remote.py` | `publish-to-server.ps1` | `git fetch/checkout/pull --ff-only` → `npm ci` → `npm run build` → `pm2 restart` → health check |
| `publish-server-remote.py` | **só** o GitHub Actions (`.github/workflows/deploy-server.yml`) | Faz checkout de uma **tag**, builda, reinicia o PM2 e faz health check (sem Android) |
| `publish-apk-remote.py` | **só** o GitHub Actions (`.github/workflows/release-android.yml`) | Envia o APK de release e reaponta o symlink `referencias-latest.apk` (não toca no código do servidor) |

> ⚠️ `publish-to-server-remote.py` fixa `sudo -u referencias` no código — um `app_user`
> diferente do padrão quebra o deploy.
> ⚠️ `publish-server-remote.py` deixa o repo do servidor em **detached HEAD** na
> tag; o próximo `publish:server` precisa voltar pro branch.
> ⚠️ A porta `3001` do health check está fixa nos helpers de deploy do servidor.

---

## `backup/` — dados do servidor

### `server-data.ps1`

Backup, restore e listagem do banco, `registry.db`, `workspaces.json`, `app.config.json` e
PDFs do servidor. Wrapper: [`../backup-server.ps1`](../backup-server.ps1).

```powershell
npm run backup:server          # -Action Backup -SkipConfirm
npm run backup:server:list     # -Action List
npm run restore:server         # -Action Restore -Latest -SkipConfirm  ⚠️
```

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-Action Backup\|Restore\|List` | **obrigatório** | Operação |
| `-BackupDir <path>` | `G:\Meu Drive\doutorado\app\backup` | Pasta-pai (Backup / `-Latest`) ou o snapshot em si (Restore) |
| `-Latest` | off | No Restore, usa o `server-*` mais recente que contenha `referencias.db` |
| `-ExcludePdfs` | off | Ignora os PDFs |
| `-DeployFile <path>` | `<raiz>\deploy.txt` | Credenciais |
| `-SkipConfirm` | off | Sem prompt |

O backup cria `<BackupDir>\server-<yyyyMMdd-HHmmss>\` com os arquivos e um `manifest.json`.
Durante o backup a API é **parada** (`pm2 stop`) por alguns segundos e depois reiniciada.

> 🔴 **`npm run restore:server` substitui o banco de produção sem perguntar** — ele já
> embute `-SkipConfirm`. O helper faz um snapshot prévio em
> `<app_dir>/data/backups/pre-restore-<stamp>` antes de apagar, mas:
> - os PDFs são espelhados com `rsync -a --delete` → **PDF que não estiver no snapshot é apagado** do servidor;
> - se o pacote não tiver `registry.db`, o `registry.db` do servidor é apagado e **não** reposto.

### `server-data-remote.py`

Helper paramiko que executa o backup/restore/list de fato. Uso interno, sem CLI. Staging
remoto em `/tmp/referencias-backup`.

---

## `migrate/` — dados locais → servidor

> ⚠️ Estes scripts **não** leem `deploy.txt`. Passe `-ServerHost` e tenha SSH por chave
> funcionando. Use o **IP do Droplet**, não o domínio atrás do Cloudflare.
> ⚠️ **Feche a API local** (`npm run dev`) antes de copiar o SQLite.

### `local-to-server.ps1` — migração completa

Envia banco + `registry.db` + `workspaces.json` (+ PDFs opcionais) para
`/tmp/referencias-migrate/` e dispara o `import-on-server.sh` automaticamente.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migrate\local-to-server.ps1 `
  -ServerHost 159.223.130.39 -IncludePdfs -SkipConfirm
```

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-ServerHost <ip>` | **obrigatório** | Destino |
| `-ServerUser <user>` | `root` | Usuário SSH |
| `-DbPath <path>` | `app.config.json` → `sqliteDbPath` | Banco de origem |
| `-PdfRoot <path>` | `app.config.json` → `allowedPdfRoots[0]` | Origem dos PDFs |
| `-IncludePdfs` | off | Inclui os PDFs |
| `-SkipConfirm` | off | Sem prompt |

Staging local em `%TEMP%\referencias-migrate-<stamp>` — não é apagado automaticamente.

> ⚠️ O relatório de tamanho tem `referencias.db` fixo no código: se `-DbPath` tiver outro
> nome de arquivo, o script falha no fim mesmo com a cópia bem-sucedida.

### `upload-db-only.ps1` — só o banco

Para quando o servidor já está configurado e só os dados estão velhos (ex.: "workspace vazio").
Dispara o `import-db-only.sh`.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migrate\upload-db-only.ps1 -ServerHost 159.223.130.39
```

Parâmetros: `-ServerHost` (obrigatório), `-ServerUser` (`root`), `-DbPath`, `-RepoRoot`.

> ⚠️ **Não tem confirmação nenhuma** — executa direto. E não checa `$LASTEXITCODE` no fim,
> então imprime "Concluído" mesmo se o import falhar. Confira a saída do servidor.

### `import-on-server.sh` 🐧 — import completo

Roda **no servidor, como root**. Consome o pacote de `/tmp/referencias-migrate/`.

```bash
sudo bash /opt/referencias/scripts/migrate/import-on-server.sh
```

Variáveis: `APP_DIR` (`/opt/referencias`), `APP_USER` (`referencias`),
`PDF_DIR` (`/var/lib/referencias/pdfs`), `MIGRATE_DIR` (`/tmp/referencias-migrate`),
`PM2_APP_NAME` (`referencias-api`), `SKIP_PDF_PATHS` (`false`).

Ordem: checa root → checa pacote → para a API → **backup** em
`data/backups/pre-migrate-<stamp>/` → importa banco → registry → `workspaces.json` →
`app.config.json` → PDFs → sobe a API → health check.

> 🔴 Substitui o banco do servidor inteiro pelo local. **Reescreve `app.config.json` do zero**
> com apenas `sqliteDbPath` e `allowedPdfRoots` — outras chaves são perdidas e esse arquivo
> **não** entra no backup prévio. Reescreve linhas do `.env` sem backup. Com
> `SKIP_PDF_PATHS=false`, todos os workspaces passam a apontar pro mesmo banco/pasta.
> PDFs são mesclados (não apagam os existentes).

### `import-db-only.sh` 🐧 — só o banco

```bash
sudo bash /opt/referencias/scripts/migrate/import-db-only.sh
```

Variáveis: `APP_DIR`, `APP_USER`, `MIGRATE_DIR`, `PM2_APP_NAME`. Faz backup em
`data/backups/pre-db-import-<stamp>/`, troca o `referencias.db`, reinicia o PM2 e imprime a
contagem de linhas de `groups` e `articles` como sanity check. Não toca em config,
workspaces nem PDFs.

### `create-join-token.sh` 🐧 — token de convite (servidor)

```bash
sudo bash /opt/referencias/scripts/migrate/create-join-token.sh
sudo bash /opt/referencias/scripts/migrate/create-join-token.sh tese-do-sergio
```

Argumento posicional = id do workspace (padrão `tese-do-sergio`); precisa existir em
`data/workspaces.json`. Cria as tabelas se faltarem, insere um device `bootstrap-admin` e
gera um token `ws_<base64url>`. Use quando o `registry.db` não foi migrado e ninguém
consegue entrar. Apenas adiciona registros — execuções repetidas acumulam devices e tokens.

> 🔒 O token é impresso no terminal em texto claro.

### `gen-token-local.mjs` — token de convite (local)

```powershell
node .\scripts\migrate\gen-token-local.mjs tese-do-sergio
```

Equivalente local, contra `data/registry.db`. Diferente da versão `.sh`, **não** cria as
tabelas — falha num registry novo. Exige `better-sqlite3` instalado.

---

## `android/` e helpers de build

### `android/build-and-copy-apk.ps1`

Build web + sync Capacitor + Gradle assemble, e copia o APK renomeado para o destino.
Wrapper: [`../build-android-apk.ps1`](../build-android-apk.ps1); npm: `build:android:copy`.

| Parâmetro | Padrão | O que faz |
|---|---|---|
| `-Destination <path>` | `G:\Meu Drive\doutorado\app` | Pasta de saída (criada se faltar) |
| `-SkipSync` | off | Pula `npm run build:android`, só recompila o APK |
| `-Debug` | off | Variante debug (mais rápida, sem assinatura release) |

Saída: `<Destination>\referencias-<versionName>-<release|debug>.apk`, com a versão lida de
`frontend/android/app/build.gradle` (`unknown` se não achar). Sobrescreve com `-Force` um
APK de mesmo nome. Se `ANDROID_HOME`/`ANDROID_SDK_ROOT` não estiver setado ele apenas avisa
e deixa o Gradle falhar depois.

### Scripts Node em `scripts/*.mjs`

| Arquivo | Como se usa | Papel |
|---|---|---|
| `android-gradle.mjs` | `node scripts/android-gradle.mjs <tarefa>` | Wrapper multiplataforma do `gradlew` em `frontend/android`. Base dos npm scripts `android:assemble`, `android:assemble:debug`, `android:bundle` |
| `android-set-version.mjs` | `node scripts/android-set-version.mjs 1.2.3` | Reescreve `versionCode` (`major*10000+minor*100+patch`) e `versionName` no `build.gradle` |
| `sync-package-version.mjs` | `node scripts/sync-package-version.mjs` | Alinha `version` dos 3 `package.json` + Android à versão derivada do git. Chamado por `release.ps1` e `publish-to-server.ps1` |
| `resolve-build-version.mjs` | `import { resolveBuildVersion }` | Deriva versão/build id de `git describe --tags`, com fallback pro `frontend/package.json`. Consumido pelo `vite.config.ts` (`VITE_APP_VERSION`, `VITE_BUILD_ID`, `VITE_BUILD_LABEL`) |
| `run-build-android-copy.mjs` | `npm run build:android:copy` | Shim que chama o `build-android-apk.ps1` — Windows/PowerShell apenas |
| `android-prepare-signing.mjs` | só CI | Decodifica `ANDROID_KEYSTORE_BASE64` em `referencias-release.jks` + `keystore.properties`. Sem a variável, vira no-op |
| `android-collect-artifacts.mjs` | só CI | Acha o `.aab`/`.apk` mais recente e copia pra `release/referencias-<versão>.{aab,apk}` |
| `package-release.mjs` | só CI | Monta `release/referencias-<versão>/` com dist + docs + configs e zipa |

> ⚠️ `package-release.mjs` usa `zip` e `&&` via shell POSIX — não roda em
> cmd.exe/PowerShell puro no Windows.
> ⚠️ `sync-package-version.mjs` reescreve os `package.json` inteiros com indentação de 2
> espaços, não só a linha da versão.
> ⚠️ O auto-execute de `resolve-build-version.mjs` como CLI não dispara no Windows (a
> comparação de `import.meta.url` falha) — importe-o em vez de chamá-lo direto.

---

## Resumo dos riscos

| Script | Risco |
|---|---|
| `deploy/digitalocean-install.sh` | 🔴 `rm -rf $APP_DIR/*`, reset do UFW, sobrescreve `.env`/`app.config.json`/Nginx |
| `backup/server-data.ps1 -Action Restore` | 🔴 Troca o banco de produção; `rsync --delete` nos PDFs; `npm run restore:server` não pergunta nada |
| `migrate/import-on-server.sh` | 🔴 Troca o banco; reescreve `app.config.json` do zero (fora do backup) |
| `migrate/import-db-only.sh` | 🟠 Troca o banco (com backup prévio) |
| `migrate/upload-db-only.ps1` | 🟠 Sem confirmação; não detecta falha do import |
| `deploy/publish-to-server.ps1` | 🟠 Commita, faz push e reinicia produção; publica o branch **atual** |
| `deploy/publish-server-remote.py` | 🟠 Deixa o servidor em detached HEAD na tag |
| `android/build-and-copy-apk.ps1` | 🟢 Só sobrescreve APK de mesmo nome |
| `migrate/create-join-token.sh`, `gen-token-local.mjs` | 🟢 Só inserem registros (token em texto claro no terminal) |
