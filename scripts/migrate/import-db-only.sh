#!/usr/bin/env bash
#
# Substitui apenas o SQLite no servidor (sem reinstalar a app).
# Espera arquivos em /tmp/referencias-migrate/referencias.db (+ wal/shm opcionais).
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/referencias}"
APP_USER="${APP_USER:-referencias}"
MIGRATE_DIR="${MIGRATE_DIR:-/tmp/referencias-migrate}"
DB_NAME="referencias.db"
TARGET="${APP_DIR}/data/${DB_NAME}"
PM2_APP_NAME="${PM2_APP_NAME:-referencias-api}"

log() { printf '\033[1;34m[db-import]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[db-import] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-0}" -eq 0 ]] || die "Execute como root."
[[ -f "${MIGRATE_DIR}/${DB_NAME}" ]] || die "Envie o banco para ${MIGRATE_DIR}/${DB_NAME} primeiro."

log "Parando API..."
sudo -u "${APP_USER}" pm2 stop "${PM2_APP_NAME}" 2>/dev/null || true
sleep 1

if [[ -f "${TARGET}" ]]; then
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup="${APP_DIR}/data/backups/pre-db-import-${stamp}"
  mkdir -p "${backup}"
  cp -a "${TARGET}" "${TARGET}-wal" "${TARGET}-shm" "${backup}/" 2>/dev/null || cp -a "${TARGET}" "${backup}/"
  log "Backup do banco atual: ${backup}/"
fi

log "Importando banco (~$(du -h "${MIGRATE_DIR}/${DB_NAME}" | cut -f1))..."
rm -f "${TARGET}" "${TARGET}-wal" "${TARGET}-shm"
cp -a "${MIGRATE_DIR}/${DB_NAME}" "${TARGET}"
for s in -wal -shm; do
  [[ -f "${MIGRATE_DIR}/${DB_NAME}${s}" ]] && cp -a "${MIGRATE_DIR}/${DB_NAME}${s}" "${TARGET}${s}"
done
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/data/${DB_NAME}"*
chmod 640 "${APP_DIR}/data/${DB_NAME}"*

log "Reiniciando API..."
sudo -u "${APP_USER}" pm2 restart "${PM2_APP_NAME}"

sleep 2
groups="$(sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && node -e \"
const Database=require('better-sqlite3');
const db=new Database('${TARGET}',{readonly:true});
const g=db.prepare('SELECT COUNT(*) c FROM groups').get().c;
const a=db.prepare('SELECT COUNT(*) c FROM articles').get().c;
console.log(g+' grupos, '+a+' artigos');
\"")"
log "Banco importado: ${groups}"
log "Atualize https://ref.sergioleal.org"
