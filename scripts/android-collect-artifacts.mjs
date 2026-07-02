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
    if (fullPath.endsWith(extension) && !fullPath.includes('androidTest')) {
      matches.push(fullPath);
    }
  }
  return matches;
}

function preferReleaseArtifacts(files) {
  const release = files.filter((file) => /[/\\]release[/\\]/.test(file));
  if (release.length > 0) {
    return release;
  }
  const bundleRelease = files.filter((file) => /[/\\]bundle[/\\]release[/\\]/.test(file));
  if (bundleRelease.length > 0) {
    return bundleRelease;
  }
  return files;
}

function pickNewest(files) {
  if (files.length === 0) return null;
  return files
    .map((file) => ({ file, mtime: statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].file;
}

const aabFiles = preferReleaseArtifacts(findFiles(outputsDir, '.aab'));
const apkFiles = preferReleaseArtifacts(findFiles(outputsDir, '.apk'));

if (aabFiles.length === 0 && apkFiles.length === 0) {
  console.error(`Nenhum artefato Android encontrado em ${outputsDir}`);
  process.exit(1);
}

const copied = [];

const aabSource = pickNewest(aabFiles);
if (aabSource) {
  const target = join(releaseDir, `referencias-${version}.aab`);
  copyFileSync(aabSource, target);
  copied.push(target);
}

const apkSource = pickNewest(apkFiles);
if (apkSource) {
  const target = join(releaseDir, `referencias-${version}.apk`);
  copyFileSync(apkSource, target);
  copied.push(target);
}

for (const file of copied) {
  console.log(`Artefato Android: ${file}`);
}
