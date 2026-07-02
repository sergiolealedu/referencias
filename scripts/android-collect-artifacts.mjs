#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Uso: node scripts/android-collect-artifacts.mjs <versão>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputsDir = join(root, 'frontend', 'android', 'app', 'build', 'outputs');
const releaseDir = join(root, 'release');
mkdirSync(releaseDir, { recursive: true });

function findFiles(dir, extension) {
  const matches = [];
  if (!existsSync(dir)) return matches;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      matches.push(...findFiles(fullPath, extension));
      continue;
    }
    if (fullPath.endsWith(extension)) {
      matches.push(fullPath);
    }
  }
  return matches;
}

const aabFiles = findFiles(outputsDir, '.aab');
const apkFiles = findFiles(outputsDir, '.apk');

if (aabFiles.length === 0 && apkFiles.length === 0) {
  console.error(`Nenhum artefato Android encontrado em ${outputsDir}`);
  process.exit(1);
}

const copied = [];

if (aabFiles.length > 0) {
  const target = join(releaseDir, `referencias-${version}.aab`);
  copyFileSync(aabFiles[0], target);
  copied.push(target);
}

if (apkFiles.length > 0) {
  const target = join(releaseDir, `referencias-${version}.apk`);
  copyFileSync(apkFiles[0], target);
  copied.push(target);
}

for (const file of copied) {
  console.log(`Artefato Android: ${file}`);
}
