import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceId = process.argv[2] ?? 'tese-do-sergio';
const dbPath = resolve(root, 'data/registry.db');
const configPath = resolve(root, 'data/workspaces.json');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const workspace = config.workspaces.find((w) => w.id === workspaceId);
if (!workspace) {
  console.error(`Workspace "${workspaceId}" não existe em workspaces.json`);
  process.exit(1);
}

const db = new Database(dbPath);

let device = db
  .prepare(
    `SELECT d.id FROM devices d
     JOIN device_workspaces dw ON dw.device_id = d.id
     WHERE dw.workspace_id = ? LIMIT 1`,
  )
  .get(workspaceId);

if (!device) {
  const deviceId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO devices (id, label, created_at, active_workspace_id) VALUES (?, ?, ?, ?)`,
  ).run(deviceId, 'token-gen', now, workspaceId);
  db.prepare(
    `INSERT INTO device_workspaces (device_id, workspace_id, joined_at) VALUES (?, ?, ?)`,
  ).run(deviceId, workspaceId, now);
  device = { id: deviceId };
}

const token = `ws_${randomBytes(24).toString('base64url')}`;
const now = new Date().toISOString();
db.prepare(
  `INSERT INTO join_tokens (token, workspace_id, created_by_device_id, created_at, revoked)
   VALUES (?, ?, ?, ?, 0)`,
).run(token, workspaceId, device.id, now);

console.log(`Workspace: ${workspace.name} (${workspaceId})`);
console.log(`Token: ${token}`);
console.log(`Created: ${now}`);

const active = db
  .prepare(
    `SELECT token, created_at FROM join_tokens
     WHERE workspace_id = ? AND revoked = 0
     ORDER BY created_at DESC`,
  )
  .all(workspaceId);
console.log(`Tokens ativos: ${active.length}`);
