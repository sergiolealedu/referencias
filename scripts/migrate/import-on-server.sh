#!/usr/bin/env bash
#
# Importa dados enviados do ambiente local para o servidor (DigitalOcean).
# Não altera nada na máquina de origem — apenas recebe arquivos em /tmp/referencias-migrate/.
#
# Uso (no servidor, como root):
#   sudo bash scripts/migrate/import-on-server.sh
#
# Variáveis opcionais:
#   APP_DIR=/opt/referencias
#   APP_USER=referencias
#   PDF_DIR=/var/lib/referencias/pdfs
#   MIGRATE_DIR=/tmp/referencias-migrate
#   SKIP_PDF_PATHS=true   Não reescrever allowedPdfRoots no workspaces.json
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/referencias}"
APP_USER="${APP_USER:-referencias}"
PDF_DIR="${PDF_DIR:-/var/lib/referencias/pdfs}"
MIGRATE_DIR="${MIGRATE_DIR:-/tmp/referencias-migrate}"
PM2_APP_NAME="${PM2_APP_NAME:-referencias-api}"
SKIP_PDF_PATHS="${SKIP_PDF_PATHS:-false}"

DB_NAME="referencias.db"
TARGET_DB="${APP_DIR}/data/${DB_NAME}"
TARGET_DATA="${APP_DIR}/data"

log()  { printf '\033[1;34m[migrate]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[migrate]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[migrate] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  [[ "${EUID:-$(id -u)}" -ne 0 ]] || return 0
  die "Execute como root: sudo bash $0"
}

require_migrate_bundle() {
  [[ -f "${MIGRATE_DIR}/${DB_NAME}" ]] || die "Arquivo não encontrado: ${MIGRATE_DIR}/${DB_NAME}"
  log "Pacote de migração encontrado em ${MIGRATE_DIR}"
}

stop_api() {
  log "Parando API..."
  sudo -u "${APP_USER}" pm2 stop "${PM2_APP_NAME}" 2>/dev/null || true
  sleep 1
}

start_api() {
  log "Reiniciando API..."
  sudo -u "${APP_USER}" pm2 restart "${PM2_APP_NAME}" 2>/dev/null \
    || sudo -u "${APP_USER}" pm2 start npm --name "${PM2_APP_NAME}" -- start --cwd "${APP_DIR}"
  sleep 2
}

backup_existing() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local backup_dir="${APP_DIR}/data/backups/pre-migrate-${stamp}"
  mkdir -p "${backup_dir}"

  if [[ -f "${TARGET_DB}" ]]; then
    log "Backup do banco atual → ${backup_dir}/"
    cp -a "${TARGET_DB}" "${TARGET_DB}-wal" "${TARGET_DB}-shm" "${backup_dir}/" 2>/dev/null || cp -a "${TARGET_DB}" "${backup_dir}/"
  fi
  [[ -f "${TARGET_DATA}/workspaces.json" ]] && cp -a "${TARGET_DATA}/workspaces.json" "${backup_dir}/"
  [[ -f "${TARGET_DATA}/registry.db" ]] && cp -a "${TARGET_DATA}/registry.db" "${backup_dir}/" 2>/dev/null || true
}

import_sqlite() {
  log "Importando SQLite → ${TARGET_DB}"
  mkdir -p "${TARGET_DATA}"
  rm -f "${TARGET_DB}" "${TARGET_DB}-wal" "${TARGET_DB}-shm"
  cp -a "${MIGRATE_DIR}/${DB_NAME}" "${TARGET_DB}"

  for suffix in -wal -shm; do
    if [[ -f "${MIGRATE_DIR}/${DB_NAME}${suffix}" ]]; then
      cp -a "${MIGRATE_DIR}/${DB_NAME}${suffix}" "${TARGET_DATA}/${DB_NAME}${suffix}"
    fi
  done

  chown "${APP_USER}:${APP_USER}" "${TARGET_DATA}/${DB_NAME}"*
  chmod 640 "${TARGET_DATA}/${DB_NAME}"*
}

import_registry() {
  if [[ ! -f "${MIGRATE_DIR}/registry.db" ]]; then
    warn "registry.db não enviado — dispositivos precisarão registrar de novo no navegador."
    return
  fi
  log "Importando registry.db (sessões de dispositivos)..."
  cp -a "${MIGRATE_DIR}/registry.db" "${TARGET_DATA}/registry.db"
  for suffix in -wal -shm; do
    [[ -f "${MIGRATE_DIR}/registry.db${suffix}" ]] && cp -a "${MIGRATE_DIR}/registry.db${suffix}" "${TARGET_DATA}/registry.db${suffix}"
  done
  chown "${APP_USER}:${APP_USER}" "${TARGET_DATA}/registry.db"*
}

write_workspaces_json() {
  local ws_source="${MIGRATE_DIR}/workspaces.json"
  local ws_target="${TARGET_DATA}/workspaces.json"

  if [[ -f "${ws_source}" && "${SKIP_PDF_PATHS}" != "true" ]]; then
    log "Ajustando workspaces.json para caminhos Linux..."
    node - "${ws_source}" "${ws_target}" "${TARGET_DB}" "${PDF_DIR}" <<'NODE'
const fs = require('node:fs');
const [src, dest, dbPath, pdfDir] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(src, 'utf8'));
for (const ws of config.workspaces ?? []) {
  ws.sqliteDbPath = dbPath;
  ws.allowedPdfRoots = [pdfDir];
}
fs.writeFileSync(dest, JSON.stringify(config, null, 2) + '\n');
NODE
  elif [[ -f "${ws_source}" ]]; then
    cp -a "${ws_source}" "${ws_target}"
  else
    log "Gerando workspaces.json padrão..."
    cat >"${ws_target}" <<EOF
{
  "activeWorkspaceId": "tese-do-sergio",
  "workspaces": [
    {
      "id": "tese-do-sergio",
      "name": "Tese do Sergio",
      "sqliteDbPath": "${TARGET_DB}",
      "allowedPdfRoots": [
        "${PDF_DIR}"
      ],
      "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
    }
  ]
}
EOF
  fi
  chown "${APP_USER}:${APP_USER}" "${ws_target}"
  chmod 640 "${ws_target}"
}

update_app_config() {
  log "Atualizando app.config.json..."
  cat >"${APP_DIR}/app.config.json" <<EOF
{
  "sqliteDbPath": "${TARGET_DB}",
  "allowedPdfRoots": [
    "${PDF_DIR}"
  ]
}
EOF
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/app.config.json"

  if [[ -f "${APP_DIR}/.env" ]]; then
    sed -i "s|^SQLITE_DB_PATH=.*|SQLITE_DB_PATH=${TARGET_DB}|" "${APP_DIR}/.env"
    sed -i "s|^ALLOWED_PDF_ROOTS=.*|ALLOWED_PDF_ROOTS=${PDF_DIR}|" "${APP_DIR}/.env"
  fi
}

import_pdfs() {
  if [[ ! -d "${MIGRATE_DIR}/pdfs" ]]; then
    warn "Pasta pdfs/ não enviada — links de PDF no servidor só funcionarão após enviar os arquivos."
    return
  fi
  log "Importando PDFs → ${PDF_DIR}..."
  mkdir -p "${PDF_DIR}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${MIGRATE_DIR}/pdfs/" "${PDF_DIR}/"
  else
    cp -a "${MIGRATE_DIR}/pdfs/." "${PDF_DIR}/"
  fi
  chown -R "${APP_USER}:${APP_USER}" "${PDF_DIR}"
}

health_check() {
  local tries=0
  until curl -fsS "http://127.0.0.1:3001/api/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [[ "${tries}" -lt 15 ]] || die "API não respondeu após importação."
    sleep 2
  done
  log "API OK: $(curl -fsS "http://127.0.0.1:3001/api/health")"
}

print_summary() {
  cat <<EOF

══════════════════════════════════════════════════════════════
  Migração concluída (dados locais intactos)
══════════════════════════════════════════════════════════════
  Banco     : ${TARGET_DB}
  Workspaces: ${TARGET_DATA}/workspaces.json
  PDFs      : ${PDF_DIR}

  Verifique: https://ref.sergioleal.org
  Local     : seus arquivos originais não foram alterados.
══════════════════════════════════════════════════════════════
EOF
}

main() {
  require_root
  require_migrate_bundle
  stop_api
  backup_existing
  import_sqlite
  import_registry
  write_workspaces_json
  update_app_config
  import_pdfs
  start_api
  health_check
  print_summary
}

main "$@"
