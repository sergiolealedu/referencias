import { z } from 'zod';

import { articleSchema } from './referencias.js';

export const groupExportMetaSchema = z.object({
  title: z.string().min(1),
  versao: z.string().default('v2'),
  mecanismo: z.string().default(''),
  stringBusca: z.string().default(''),
  createdAt: z.string(),
  sourceId: z.number(),
});

export const groupExportSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  group: groupExportMetaSchema,
  articles: z.array(articleSchema),
});

export const groupImportOptionsSchema = z.object({
  targetGroupId: z.number().optional(),
  title: z.string().min(1).optional(),
  onConflict: z.enum(['skip', 'replace']).optional().default('skip'),
});

export const groupImportBodySchema = groupExportSchema.extend({
  options: groupImportOptionsSchema.optional(),
});

export type GroupExportPayload = z.infer<typeof groupExportSchema>;
export type GroupImportBody = z.infer<typeof groupImportBodySchema>;
