/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_ID: string;
  readonly VITE_BUILD_LABEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
