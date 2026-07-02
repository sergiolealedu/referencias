#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'android');
const isWindows = process.platform === 'win32';
const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Uso: node scripts/android-gradle.mjs <tarefa-gradle> [...args]');
  process.exit(1);
}

const result = spawnSync(gradlew, args, {
  cwd: root,
  stdio: 'inherit',
  shell: isWindows,
});

process.exit(result.status ?? 1);
