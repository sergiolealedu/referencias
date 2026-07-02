import { getItem, removeItem, setItem } from '../platform/storage';

const AUTH_TOKEN_KEY = 'referencias-auth-token';
const LEGACY_DEVICE_ID_KEY = 'referencias-device-id';

export async function getAuthToken(): Promise<string | null> {
  return getItem(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  await setItem(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await removeItem(AUTH_TOKEN_KEY);
}

/** @deprecated Mantido apenas para migração de sessões antigas. */
export async function getLegacyDeviceId(): Promise<string | null> {
  return getItem(LEGACY_DEVICE_ID_KEY);
}

/** @deprecated Mantido apenas para migração de sessões antigas. */
export async function setLegacyDeviceId(id: string): Promise<void> {
  await setItem(LEGACY_DEVICE_ID_KEY, id);
}

export async function clearLegacyDeviceId(): Promise<void> {
  await removeItem(LEGACY_DEVICE_ID_KEY);
}

// Sincronização síncrona para compatibilidade com código legado web
export function getAuthTokenSync(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthTokenSync(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getLegacyDeviceIdSync(): string | null {
  return localStorage.getItem(LEGACY_DEVICE_ID_KEY);
}

export function setLegacyDeviceIdSync(id: string): void {
  localStorage.setItem(LEGACY_DEVICE_ID_KEY, id);
}
