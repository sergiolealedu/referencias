import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DB_PATH = resolve(__dirname, '../../../data/registry.db');

export interface DeviceRow {
  id: string;
  label: string | null;
  created_at: string;
  active_workspace_id: string | null;
  auth_token: string | null;
}

function generateAuthToken(): string {
  return `dev_${randomBytes(24).toString('base64url')}`;
}

export interface JoinTokenRow {
  token: string;
  workspace_id: string;
  created_by_device_id: string;
  created_at: string;
  revoked: number;
}

export class RegistryStore {
  private db: Database.Database;

  constructor(dbPath = REGISTRY_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.db.exec(schema);
    this.migrateAuthTokenColumn();
  }

  private migrateAuthTokenColumn(): void {
    const columns = this.db
      .prepare('PRAGMA table_info(devices)')
      .all() as Array<{ name: string }>;
    if (!columns.some((col) => col.name === 'auth_token')) {
      this.db.exec('ALTER TABLE devices ADD COLUMN auth_token TEXT');
    }
    this.db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_auth_token ON devices(auth_token)',
    );
  }

  close(): void {
    this.db.close();
  }

  getMeta(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM registry_meta WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO registry_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getDeviceByAuthToken(authToken: string): DeviceRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM devices WHERE auth_token = ?')
        .get(authToken) as DeviceRow | undefined) ?? null
    );
  }

  ensureAuthToken(deviceId: string): string {
    const device = this.getDevice(deviceId);
    if (!device) {
      throw new Error(`Dispositivo "${deviceId}" não encontrado.`);
    }
    if (device.auth_token) {
      return device.auth_token;
    }
    const authToken = generateAuthToken();
    this.db.prepare('UPDATE devices SET auth_token = ? WHERE id = ?').run(authToken, deviceId);
    return authToken;
  }

  getDevice(id: string): DeviceRow | null {
    return (
      (this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined) ??
      null
    );
  }

  createDevice(id: string, label: string | null = null): DeviceRow {
    const createdAt = new Date().toISOString();
    const authToken = generateAuthToken();
    this.db
      .prepare(
        'INSERT INTO devices (id, label, created_at, auth_token) VALUES (?, ?, ?, ?)',
      )
      .run(id, label, createdAt, authToken);
    return {
      id,
      label,
      created_at: createdAt,
      active_workspace_id: null,
      auth_token: authToken,
    };
  }

  setDeviceActiveWorkspace(deviceId: string, workspaceId: string | null): void {
    this.db
      .prepare('UPDATE devices SET active_workspace_id = ? WHERE id = ?')
      .run(workspaceId, deviceId);
  }

  listDeviceWorkspaceIds(deviceId: string): string[] {
    const rows = this.db
      .prepare('SELECT workspace_id FROM device_workspaces WHERE device_id = ? ORDER BY joined_at')
      .all(deviceId) as Array<{ workspace_id: string }>;
    return rows.map((row) => row.workspace_id);
  }

  addDeviceToWorkspace(deviceId: string, workspaceId: string): void {
    const joinedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO device_workspaces (device_id, workspace_id, joined_at)
         VALUES (?, ?, ?)`,
      )
      .run(deviceId, workspaceId, joinedAt);
  }

  hasWorkspaceAccess(deviceId: string, workspaceId: string): boolean {
    const row = this.db
      .prepare(
        'SELECT 1 FROM device_workspaces WHERE device_id = ? AND workspace_id = ? LIMIT 1',
      )
      .get(deviceId, workspaceId);
    return Boolean(row);
  }

  removeDeviceFromWorkspace(deviceId: string, workspaceId: string): void {
    this.db
      .prepare('DELETE FROM device_workspaces WHERE device_id = ? AND workspace_id = ?')
      .run(deviceId, workspaceId);
  }

  countDeviceWorkspaces(deviceId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM device_workspaces WHERE device_id = ?')
      .get(deviceId) as { count: number };
    return row.count;
  }

  createJoinToken(workspaceId: string, createdByDeviceId: string): JoinTokenRow {
    const token = `ws_${randomBytes(24).toString('base64url')}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO join_tokens (token, workspace_id, created_by_device_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(token, workspaceId, createdByDeviceId, createdAt);
    return {
      token,
      workspace_id: workspaceId,
      created_by_device_id: createdByDeviceId,
      created_at: createdAt,
      revoked: 0,
    };
  }

  getJoinToken(token: string): JoinTokenRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM join_tokens WHERE token = ? AND revoked = 0')
        .get(token) as JoinTokenRow | undefined) ?? null
    );
  }

  listJoinTokens(workspaceId: string): JoinTokenRow[] {
    return this.db
      .prepare(
        'SELECT * FROM join_tokens WHERE workspace_id = ? AND revoked = 0 ORDER BY created_at DESC',
      )
      .all(workspaceId) as JoinTokenRow[];
  }

  revokeJoinToken(token: string): boolean {
    const result = this.db
      .prepare('UPDATE join_tokens SET revoked = 1 WHERE token = ? AND revoked = 0')
      .run(token);
    return result.changes > 0;
  }
}

let registryInstance: RegistryStore | null = null;

export function getRegistry(): RegistryStore {
  if (!registryInstance) {
    registryInstance = new RegistryStore();
  }
  return registryInstance;
}
