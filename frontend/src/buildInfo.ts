export const APP_TITLE = 'Referências — Doutorado';

export const APP_VERSION = import.meta.env.VITE_APP_VERSION;

export const BUILD_ID = import.meta.env.VITE_BUILD_ID;

export const BUILD_LABEL = import.meta.env.VITE_BUILD_LABEL;

export function getDocumentTitle(): string {
  return `${APP_TITLE} ${BUILD_LABEL}`;
}
