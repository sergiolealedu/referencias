import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveBuildVersion } from './resolve-build-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const { appVersion } = resolveBuildVersion(repoRoot);

const packagePaths = [
  path.join(repoRoot, 'package.json'),
  path.join(repoRoot, 'backend', 'package.json'),
  path.join(repoRoot, 'frontend', 'package.json'),
];

for (const packagePath of packagePaths) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
  pkg.version = appVersion;
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
}

execSync(`node scripts/android-set-version.mjs ${appVersion}`, {
  cwd: repoRoot,
  stdio: 'inherit',
});

console.log(`Versão alinhada para ${appVersion} (package.json + Android)`);
