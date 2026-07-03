#!/usr/bin/env bash
#
# Gera um token de convite para um workspace existente no servidor.
# Use quando o registry.db local não foi migrado ou os tokens locais não funcionam.
#
# Uso (no servidor, como root):
#   sudo bash scripts/migrate/create-join-token.sh
#   sudo bash scripts/migrate/create-join-token.sh tese-do-sergio
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/referencias}"
REGISTRY_DB="${REGISTRY_DB:-${APP_DIR}/data/registry.db}"
WORKSPACE_ID="${1:-tese-do-sergio}"
PM2_APP_NAME="${PM2_APP_NAME:-referencias-api}"
APP_USER="${APP_USER:-referencias}"

log() { printf '\033[1;34m[token]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[token] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "${REGISTRY_DB}" ]] || die "registry.db não encontrado: ${REGISTRY_DB}"

TOKEN="$(
  sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && node - '${REGISTRY_DB}' '${WORKSPACE_ID}'" <<'NODE'
const Database = require('better-sqlite3');
const { randomBytes, randomUUID } = require('node:crypto');

const [dbPath, workspaceId] = process.argv.slice(2);
const db = new Database(dbPath);

const ws = db.prepare(
  "SELECT value FROM registry_meta WHERE key = 'legacy_workspace_ids'"
).get();
const workspacesFile = require('node:fs').readFileSync(
  require('node:path').join(require('node:path').dirname(dbPath), 'workspaces.json'),
  'utf8'
);
const config = JSON.parse(workspacesFile);
if (!config.workspaces.some((w) => w.id === workspaceId)) {
  console.error(`Workspace "${workspaceId}" não existe em workspaces.json`);
  process.exit(1);
}

const deviceId = randomUUID();
const now = new Date().toISOString();
const token = `ws_${randomBytes(24).toString('base64url')}`;

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    label TEXT,
    created_at TEXT NOT NULL,
    active_workspace_id TEXT,
    auth_token TEXT
  );
  CREATE TABLE IF NOT EXISTS device_workspaces (
    device_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (device_id, workspace_id)
  );
  CREATE TABLE IF NOT EXISTS join_tokens (
    token TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_by_device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  );
`);

db.prepare(
  `INSERT OR IGNORE INTO devices (id, label, created_at, active_workspace_id)
   VALUES (?, 'bootstrap-admin', ?, ?)`
).run(deviceId, now, workspaceId);

db.prepare(
  `INSERT OR IGNORE INTO device_workspaces (device_id, workspace_id, joined_at)
   VALUES (?, ?, ?)`
).run(deviceId, workspaceId, now);

db.prepare(
  `INSERT INTO join_tokens (token, workspace_id, created_by_device_id, created_at, revoked)
   VALUES (?, ?, ?, ?, 0)`
).run(token, workspaceId, deviceId, now);

console.log(token);
NODE
)"

chown "${APP_USER}:${APP_USER}" "${REGISTRY_DB}" "${REGISTRY_DB}-wal" "${REGISTRY_DB}-shm" 2>/dev/null || chown "${APP_USER}:${APP_USER}" "${REGISTRY_DB}"

log "Token gerado para workspace '${WORKSPACE_ID}':"
echo ""
echo "  ${TOKEN}"
echo ""
log "Cole em https://ref.sergioleal.org → Entrar com token"
