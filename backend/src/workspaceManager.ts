import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defaultPdfRootsForDbPath,
  getAppSettings,
  saveAppSettings,
  type AppSettings,
} from './appSettings.js';
import type {
  Workspace,
  WorkspaceInput,
  WorkspaceSummary,
  WorkspacesConfig,
} from './types/workspace.js';

export type { Workspace, WorkspaceInput, WorkspaceSummary, WorkspacesConfig };

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKSPACES_CONFIG_PATH = resolve(__dirname, '../../data/workspaces.json');
const DEFAULT_WORKSPACES_DIR = resolve(__dirname, '../../data/workspaces');

let currentConfig: WorkspacesConfig | null = null;

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'workspace';
}

function uniqueId(base: string, existing: Set<string>): string {
  let id = base;
  let counter = 2;
  while (existing.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  return id;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dirname(WORKSPACES_CONFIG_PATH), { recursive: true });
}

async function readConfigFile(): Promise<WorkspacesConfig | null> {
  try {
    const raw = await readFile(WORKSPACES_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as WorkspacesConfig;
    if (!parsed.activeWorkspaceId || !Array.isArray(parsed.workspaces)) {
      return null;
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeConfigFile(config: WorkspacesConfig): Promise<void> {
  await ensureDataDir();
  await writeFile(WORKSPACES_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  currentConfig = structuredClone(config);
}

async function bootstrapFromAppSettings(settings: AppSettings): Promise<WorkspacesConfig> {
  const id = 'tese-do-sergio';
  const workspace: Workspace = {
    id,
    name: 'Tese do Sergio',
    sqliteDbPath: settings.sqliteDbPath,
    allowedPdfRoots: settings.allowedPdfRoots,
    createdAt: new Date().toISOString(),
  };
  const config: WorkspacesConfig = {
    activeWorkspaceId: id,
    workspaces: [workspace],
  };
  await writeConfigFile(config);
  return config;
}

export async function loadWorkspaces(): Promise<WorkspacesConfig> {
  if (currentConfig) {
    return structuredClone(currentConfig);
  }

  const existing = await readConfigFile();
  if (existing) {
    currentConfig = existing;
    return structuredClone(existing);
  }

  const settings = getAppSettings();
  const config = await bootstrapFromAppSettings(settings);
  return structuredClone(config);
}

export function getWorkspacesConfig(): WorkspacesConfig {
  if (!currentConfig) {
    throw new Error('Workspaces não carregados. Chame loadWorkspaces() primeiro.');
  }
  return structuredClone(currentConfig);
}

export function getWorkspaceById(id: string): Workspace {
  const workspace = getWorkspacesConfig().workspaces.find((ws) => ws.id === id);
  if (!workspace) {
    throw new WorkspaceNotFoundError(id);
  }
  return structuredClone(workspace);
}

/** Workspace ativo global (fallback para health check / boot). */
export function getActiveWorkspace(): Workspace {
  const config = getWorkspacesConfig();
  const active = config.workspaces.find((ws) => ws.id === config.activeWorkspaceId);
  if (!active) {
    throw new Error(`Workspace ativo "${config.activeWorkspaceId}" não encontrado.`);
  }
  return structuredClone(active);
}

export function listAllWorkspaces(): Workspace[] {
  return getWorkspacesConfig().workspaces.map((ws) => structuredClone(ws));
}

export function listWorkspaceSummariesForDevice(
  deviceId: string,
  activeWorkspaceId: string | null,
  allowedWorkspaceIds: string[],
): WorkspaceSummary[] {
  const allowed = new Set(allowedWorkspaceIds);
  return getWorkspacesConfig()
    .workspaces.filter((ws) => allowed.has(ws.id))
    .map((ws) => ({
      ...structuredClone(ws),
      isActive: ws.id === activeWorkspaceId,
    }));
}

export async function syncActiveWorkspaceToAppSettings(workspace: Workspace): Promise<AppSettings> {
  const config = getWorkspacesConfig();
  config.activeWorkspaceId = workspace.id;
  await writeConfigFile(config);
  return saveAppSettings({
    sqliteDbPath: workspace.sqliteDbPath,
    allowedPdfRoots: workspace.allowedPdfRoots,
  });
}

async function defaultDbPathForWorkspace(name: string): Promise<string> {
  await mkdir(DEFAULT_WORKSPACES_DIR, { recursive: true });
  const slug = slugify(name);
  return resolve(DEFAULT_WORKSPACES_DIR, slug, 'referencias.db');
}

export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const config = getWorkspacesConfig();
  const existingIds = new Set(config.workspaces.map((ws) => ws.id));
  const id = uniqueId(slugify(input.name), existingIds);

  const sqliteDbPath = input.sqliteDbPath?.trim() || (await defaultDbPathForWorkspace(input.name));
  await mkdir(dirname(sqliteDbPath), { recursive: true });

  const globalSettings = getAppSettings();
  const allowedPdfRoots =
    input.allowedPdfRoots?.length
      ? input.allowedPdfRoots
      : globalSettings.allowedPdfRoots;

  const workspace: Workspace = {
    id,
    name: input.name.trim(),
    sqliteDbPath,
    allowedPdfRoots,
    createdAt: new Date().toISOString(),
  };

  config.workspaces.push(workspace);
  await writeConfigFile(config);
  return structuredClone(workspace);
}

export async function updateWorkspace(
  id: string,
  input: Partial<WorkspaceInput>,
): Promise<Workspace> {
  const config = getWorkspacesConfig();
  const index = config.workspaces.findIndex((ws) => ws.id === id);
  if (index === -1) {
    throw new WorkspaceNotFoundError(id);
  }

  const current = config.workspaces[index];
  const next: Workspace = {
    ...current,
    name: input.name?.trim() || current.name,
    sqliteDbPath: input.sqliteDbPath?.trim() || current.sqliteDbPath,
    allowedPdfRoots:
      input.allowedPdfRoots?.length
        ? input.allowedPdfRoots
        : current.allowedPdfRoots,
  };

  if (input.sqliteDbPath && !input.allowedPdfRoots?.length) {
    next.allowedPdfRoots = defaultPdfRootsForDbPath(next.sqliteDbPath);
  }

  config.workspaces[index] = next;
  await writeConfigFile(config);
  return structuredClone(next);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const config = getWorkspacesConfig();
  const index = config.workspaces.findIndex((ws) => ws.id === id);
  if (index === -1) {
    throw new WorkspaceNotFoundError(id);
  }
  config.workspaces.splice(index, 1);
  if (config.activeWorkspaceId === id) {
    config.activeWorkspaceId = config.workspaces[0]?.id ?? '';
  }
  await writeConfigFile(config);
}

export async function updateWorkspacePaths(
  id: string,
  sqliteDbPath: string,
  allowedPdfRoots: string[],
): Promise<Workspace> {
  const config = getWorkspacesConfig();
  const index = config.workspaces.findIndex((ws) => ws.id === id);
  if (index === -1) {
    throw new WorkspaceNotFoundError(id);
  }

  try {
    await access(sqliteDbPath, constants.F_OK);
  } catch {
    await access(dirname(sqliteDbPath), constants.F_OK);
  }

  config.workspaces[index] = {
    ...config.workspaces[index],
    sqliteDbPath,
    allowedPdfRoots,
  };
  await writeConfigFile(config);
  return structuredClone(config.workspaces[index]);
}

/** Propaga pastas de PDF globais para todos os workspaces. */
export async function syncAllWorkspacePdfRoots(allowedPdfRoots: string[]): Promise<void> {
  const config = getWorkspacesConfig();
  if (config.workspaces.length === 0) {
    return;
  }

  config.workspaces = config.workspaces.map((workspace) => ({
    ...workspace,
    allowedPdfRoots,
  }));
  await writeConfigFile(config);
}

export class WorkspaceNotFoundError extends Error {
  constructor(id: string) {
    super(`Workspace "${id}" não encontrado.`);
    this.name = 'WorkspaceNotFoundError';
  }
}
