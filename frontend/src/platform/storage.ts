import { Preferences } from '@capacitor/preferences';

import { isNativePlatform } from './native';

export async function getItem(key: string): Promise<string | null> {
  if (isNativePlatform()) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}
