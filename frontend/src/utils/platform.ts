import { Capacitor } from '@capacitor/core';

const DEFAULT_NATIVE_API_BASE = 'https://ref.sergioleal.org/api';

/** App empacotado (Capacitor Android/iOS), distinto do navegador web. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Configuração global (caminhos de banco/PDF) — somente na interface web. */
export function showGlobalSettings(): boolean {
  return !isNativeApp();
}

export function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '');
  }
  if (isNativeApp()) {
    return DEFAULT_NATIVE_API_BASE;
  }
  return '/api';
}
