import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, parse } from 'node:path';

import Database from 'better-sqlite3';

export function formatBackupTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export async function backupSqliteDatabase(dbPath: string): Promise<string | null> {
  try {
    await access(dbPath, constants.F_OK);
  } catch {
    return null;
  }

  const { name } = parse(dbPath);
  const backupDir = join(dirname(dbPath), 'backups');
  await mkdir(backupDir, { recursive: true });

  const backupPath = join(backupDir, `${name}.${formatBackupTimestamp()}.db`);
  const source = new Database(dbPath, { readonly: true });

  try {
    await source.backup(backupPath);
  } finally {
    source.close();
  }

  return backupPath;
}
