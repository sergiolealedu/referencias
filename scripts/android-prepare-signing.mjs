#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'android');
const keystoreBase64 = process.env.ANDROID_KEYSTORE_BASE64?.trim();

if (!keystoreBase64) {
  console.log('ANDROID_KEYSTORE_BASE64 não definido — build Android sem assinatura de release.');
  process.exit(0);
}

const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;

if (!storePassword || !keyAlias || !keyPassword) {
  console.error(
    'Defina ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS e ANDROID_KEY_PASSWORD junto com ANDROID_KEYSTORE_BASE64.',
  );
  process.exit(1);
}

const keystorePath = join(androidDir, 'referencias-release.jks');
writeFileSync(keystorePath, Buffer.from(keystoreBase64, 'base64'));

const keystoreProps = [
  'storeFile=referencias-release.jks',
  `storePassword=${storePassword}`,
  `keyAlias=${keyAlias}`,
  `keyPassword=${keyPassword}`,
  '',
].join('\n');

writeFileSync(join(androidDir, 'keystore.properties'), keystoreProps, 'utf8');
console.log('Keystore de release preparado para o build Android.');
