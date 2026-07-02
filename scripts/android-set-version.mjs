#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('Uso: node scripts/android-set-version.mjs <versão-semver>');
  process.exit(1);
}

const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!match) {
  console.error(`Versão inválida para Android: ${version}`);
  process.exit(1);
}

const [, major, minor, patch] = match;
const versionCode = Number(major) * 10_000 + Number(minor) * 100 + Number(patch);
const versionName = `${major}.${minor}.${patch}`;

const gradlePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'frontend',
  'android',
  'app',
  'build.gradle',
);

let content = readFileSync(gradlePath, 'utf8');
content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
content = content.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, content, 'utf8');

console.log(`Android versionCode=${versionCode} versionName=${versionName}`);
