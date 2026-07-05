import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { resolveBuildVersion } from '../scripts/resolve-build-version.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { appVersion, buildId, buildLabel } = resolveBuildVersion(repoRoot);

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.VITE_BUILD_LABEL': JSON.stringify(buildLabel),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
