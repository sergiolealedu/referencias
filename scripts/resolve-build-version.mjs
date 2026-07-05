import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion(repoRoot) {
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, 'frontend', 'package.json'), 'utf-8'),
  );
  return pkg.version;
}

function gitShortHash(repoRoot) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }
}

function gitDescribe(repoRoot) {
  try {
    return execSync('git describe --tags --long --match "v*"', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    try {
      return execSync('git describe --tags --long', {
        cwd: repoRoot,
        encoding: 'utf-8',
      }).trim();
    } catch {
      return '';
    }
  }
}

/**
 * Deriva semver exibida a partir da última tag vX.Y.Z e commits posteriores.
 * Ex.: v1.1.0-20-gf99404c → 1.1.20
 */
function versionFromDescribe(describe) {
  const longMatch = /^v(\d+)\.(\d+)\.(\d+)-(\d+)-g([0-9a-f]+)$/i.exec(describe);
  if (longMatch) {
    const [, major, minor, patch, commits] = longMatch;
    return `${major}.${minor}.${Number(patch) + Number(commits)}`;
  }

  const exactTag = /^v(\d+\.\d+\.\d+)$/i.exec(describe);
  if (exactTag) {
    return exactTag[1];
  }

  return null;
}

export function resolveBuildVersion(repoRoot = path.join(__dirname, '..')) {
  const fallbackVersion = readPackageVersion(repoRoot);
  const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const hash = gitShortHash(repoRoot);
  const describe = gitDescribe(repoRoot);
  const derivedVersion = describe ? versionFromDescribe(describe) : null;
  const appVersion = derivedVersion ?? fallbackVersion;

  const buildId = hash ? `${buildTime} · ${hash}` : buildTime;
  const buildLabel = hash ? `v${appVersion} · ${hash}` : `v${appVersion} · ${buildTime}`;

  return {
    appVersion,
    buildId,
    buildLabel,
    gitDescribe: describe || null,
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  console.log(JSON.stringify(resolveBuildVersion(), null, 2));
}
