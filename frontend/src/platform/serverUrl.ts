import { Preferences } from '@capacitor/preferences';

import { isNativePlatform } from './native';

const SERVER_URL_KEY = 'referencias-server-url';
const DEFAULT_SERVER_URL = 'http://192.168.0.100:3001';

let cachedUrl: string | null = null;

export async function getServerUrl(): Promise<string> {
  if (!isNativePlatform()) {
    return '';
  }
  if (cachedUrl) return cachedUrl;
  const { value } = await Preferences.get({ key: SERVER_URL_KEY });
  cachedUrl = (value || DEFAULT_SERVER_URL).replace(/\/$/, '');
  return cachedUrl;
}

export async function setServerUrl(url: string): Promise<void> {
  const normalized = url.trim().replace(/\/$/, '');
  cachedUrl = normalized;
  await Preferences.set({ key: SERVER_URL_KEY, value: normalized });
}

export function clearServerUrlCache(): void {
  cachedUrl = null;
}

export async function getApiBase(): Promise<string> {
  if (!isNativePlatform()) {
    return '/api';
  }
  const server = await getServerUrl();
  return `${server}/api`;
}

export interface HealthStatus {
  status: string;
  dbPath?: string;
  workspaceId?: string;
  workspaceName?: string;
}

export async function checkServerHealth(): Promise<HealthStatus> {
  const base = await getApiBase();
  const response = await fetch(`${base}/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Servidor respondeu com status ${response.status}`);
  }
  return response.json() as Promise<HealthStatus>;
}
