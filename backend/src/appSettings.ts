import { access, constants } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { readFile, writeFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const APP_CONFIG_PATH = resolve(__dirname, '../../app.config.json');

const defaultDbPath = resolve(__dirname, '../../data/referencias.db');
const defaultPdfRoot = 'G:\\Meu Drive\\doutorado';

const settingsSchema = z.object({
  sqliteDbPath: z.string().min(1),
  allowedPdfRoots: z.array(z.string().min(1)).min(1),
});

export type AppSettings = z.infer<typeof settingsSchema>;

const defaultSettings: AppSettings = {
  sqliteDbPath: defaultDbPath,
  allowedPdfRoots: [defaultPdfRoot],
};

function parentDir(filePath: string): string {
  return resolve(dirname(filePath));
}

function settingsFromEnv(): Partial<AppSettings> {
  const partial: Partial<AppSettings> = {};
  if (process.env.SQLITE_DB_PATH?.trim()) {
    partial.sqliteDbPath = process.env.SQLITE_DB_PATH.trim();
  }
  const pdfRoots = process.env.ALLOWED_PDF_ROOTS?.split(';')
    .map((root) => root.trim())
    .filter(Boolean);
  if (pdfRoots?.length) {
    partial.allowedPdfRoots = pdfRoots;
  }
  return partial;
}

async function readConfigFile(): Promise<Partial<AppSettings>> {
  try {
    const raw = await readFile(APP_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const partial: Partial<AppSettings> = {};
    if (typeof parsed.sqliteDbPath === 'string') {
      partial.sqliteDbPath = parsed.sqliteDbPath;
    } else if (typeof parsed.jsonDbPath === 'string') {
      partial.sqliteDbPath = parsed.jsonDbPath.replace(/\.json$/i, '.db');
    }
    if (Array.isArray(parsed.allowedPdfRoots)) {
      partial.allowedPdfRoots = parsed.allowedPdfRoots as string[];
    }
    return settingsSchema.partial().parse(partial);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function mergeSettings(
  base: AppSettings,
  ...layers: Partial<AppSettings>[]
): AppSettings {
  let merged = { ...base };
  for (const layer of layers) {
    merged = {
      sqliteDbPath: layer.sqliteDbPath ?? merged.sqliteDbPath,
      allowedPdfRoots: layer.allowedPdfRoots ?? merged.allowedPdfRoots,
    };
  }
  return settingsSchema.parse(merged);
}

let currentSettings = defaultSettings;

export function getAppSettings(): AppSettings {
  return structuredClone(currentSettings);
}

export async function loadAppSettings(): Promise<AppSettings> {
  const fileSettings = await readConfigFile();
  currentSettings = mergeSettings(defaultSettings, fileSettings, settingsFromEnv());
  return getAppSettings();
}

export async function saveAppSettings(
  input: Partial<AppSettings>,
): Promise<AppSettings> {
  const next = mergeSettings(currentSettings, input);
  try {
    await access(next.sqliteDbPath, constants.F_OK);
  } catch {
    await access(dirname(next.sqliteDbPath), constants.F_OK);
  }
  await writeFile(APP_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  currentSettings = next;
  return getAppSettings();
}

export function defaultPdfRootsForDbPath(sqliteDbPath: string): string[] {
  return [parentDir(sqliteDbPath)];
}
