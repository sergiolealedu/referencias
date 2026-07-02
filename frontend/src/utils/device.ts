const AUTH_TOKEN_KEY = 'referencias-auth-token';
const LEGACY_DEVICE_ID_KEY = 'referencias-device-id';

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** @deprecated Mantido apenas para migração de sessões antigas. */
export function getLegacyDeviceId(): string | null {
  return localStorage.getItem(LEGACY_DEVICE_ID_KEY);
}

/** @deprecated Mantido apenas para migração de sessões antigas. */
export function setLegacyDeviceId(id: string): void {
  localStorage.setItem(LEGACY_DEVICE_ID_KEY, id);
}

export function clearLegacyDeviceId(): void {
  localStorage.removeItem(LEGACY_DEVICE_ID_KEY);
}
