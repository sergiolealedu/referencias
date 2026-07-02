import { config as dotenvConfig } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAppSettings, loadAppSettings } from './appSettings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../.env') });

await loadAppSettings();

export const config = {
  port: Number(process.env.PORT ?? 3001),
  get sqliteDbPath() {
    return getAppSettings().sqliteDbPath;
  },
  get allowedPdfRoots() {
    return getAppSettings().allowedPdfRoots;
  },
};
