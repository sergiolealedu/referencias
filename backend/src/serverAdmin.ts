import { getRegistry } from './registry/registryStore.js';

export const SERVER_ADMIN_META_KEY = 'server_admin_device_id';
const BOOTSTRAP_SYSTEM_DEVICE_ID = 'bootstrap-system';

export function getServerAdminDeviceId(): string | null {
  return getRegistry().getMeta(SERVER_ADMIN_META_KEY);
}

export function isServerAdmin(deviceId: string): boolean {
  const adminId = getServerAdminDeviceId();
  return adminId !== null && adminId === deviceId;
}

/** Define o administrador se ainda não houver um (primeiro dispositivo real com acesso). */
export function assignServerAdminIfUnset(deviceId: string): void {
  if (deviceId === BOOTSTRAP_SYSTEM_DEVICE_ID) {
    return;
  }
  const registry = getRegistry();
  if (registry.getMeta(SERVER_ADMIN_META_KEY)) {
    return;
  }
  registry.setMeta(SERVER_ADMIN_META_KEY, deviceId);
}

/**
 * Instalações existentes sem admin: promove o dispositivo que entrou primeiro
 * (exceto bootstrap-system).
 */
export function migrateServerAdminIfNeeded(): void {
  if (getServerAdminDeviceId()) {
    return;
  }

  const registry = getRegistry();
  const row = registry.getFirstMemberDeviceId(BOOTSTRAP_SYSTEM_DEVICE_ID);
  if (row) {
    registry.setMeta(SERVER_ADMIN_META_KEY, row);
  }
}

export class ServerAdminRequiredError extends Error {
  constructor() {
    super('Somente o administrador da instalação pode alterar a configuração global.');
    this.name = 'ServerAdminRequiredError';
  }
}

export function assertServerAdmin(deviceId: string): void {
  if (!isServerAdmin(deviceId)) {
    throw new ServerAdminRequiredError();
  }
}
