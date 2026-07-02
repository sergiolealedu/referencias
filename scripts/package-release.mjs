#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const version = process.argv[2];
if (!version) {
  console.error('Uso: node scripts/package-release.mjs <versão>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = join(root, 'release', `referencias-${version}`);

mkdirSync(bundleDir, { recursive: true });

const copyItems = [
  ['backend/dist', 'backend/dist'],
  ['frontend/dist', 'frontend/dist'],
  ['docs', 'docs'],
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['README.md', 'README.md'],
  ['app.config.example.json', 'app.config.example.json'],
  ['.env.example', '.env.example'],
  ['backend/package.json', 'backend/package.json'],
  ['frontend/package.json', 'frontend/package.json'],
];

for (const [from, to] of copyItems) {
  cpSync(join(root, from), join(bundleDir, to), { recursive: true });
}

writeFileSync(
  join(bundleDir, 'RELEASE.txt'),
  [
    `Referências v${version}`,
    '',
    'Conteúdo:',
    '- backend/dist — API compilada',
    '- frontend/dist — SPA estática',
    '- referencias-*.aab / referencias-*.apk — app Android (quando gerado na release)',
    '- docs — documentação funcional e não funcional',
    '',
    'Instalação rápida:',
    '  npm ci --omit=dev',
    '  npm start',
    '',
  ].join('\n'),
  'utf8',
);

const androidArtifacts = [
  `referencias-${version}.aab`,
  `referencias-${version}.apk`,
];

for (const artifact of androidArtifacts) {
  const source = join(root, 'release', artifact);
  if (existsSync(source)) {
    cpSync(source, join(bundleDir, artifact));
  }
}

const zipPath = join(root, 'release', `referencias-${version}.zip`);
execSync(`cd "${join(root, 'release')}" && zip -r "${zipPath}" "referencias-${version}"`, {
  stdio: 'inherit',
});

console.log(`Bundle criado: ${zipPath}`);
