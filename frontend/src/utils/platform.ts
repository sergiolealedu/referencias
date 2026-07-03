import { Capacitor } from '@capacitor/core';

const DEFAULT_NATIVE_API_BASE = 'https://ref.sergioleal.org/api';

/** App empacotado (Capacitor Android/iOS), distinto do navegador web. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * WebView do Capacitor (https://localhost ou capacitor://) mesmo se
 * isNativePlatform() ainda não estiver pronto no carregamento do módulo.
 */
function isCapacitorWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  return (
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    (protocol === 'https:' && hostname === 'localhost')
  );
}

/** Configuração global (caminhos de banco/PDF) — somente na interface web. */
export function showGlobalSettings(): boolean {
  return !isNativeApp() && !isCapacitorWebView();
}

export function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '');
  }
  if (isNativeApp() || isCapacitorWebView()) {
    return DEFAULT_NATIVE_API_BASE;
  }
  return '/api';
}
