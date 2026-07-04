import { z } from 'zod';

export const duplicateRefSchema = z.object({
  groupId: z.number(),
  key: z.string().min(1),
});

export const entrySchema = z.object({
  type: z.string().min(1),
  key: z.string().min(1),
  fields: z.record(z.string(), z.string()),
});

export const factorPolaritySchema = z.enum(['positive', 'negative']);

export const articleFactorSchema = z.object({
  factorId: z.string().optional(),
  label: z.string().min(1),
  polarity: factorPolaritySchema,
  description: z.string().optional().default(''),
  aliases: z.array(z.string()).optional(),
});

export const factorDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
});

export const articleSchema = z.object({
  entry: entrySchema,
  status: z.string().default('exists'),
  source: z.string().default(''),
  location: z.string().default(''),
  caminho: z.string().default(''),
  notes: z.string().default(''),
  tags: z.array(z.string()).default([]),
  factors: z.array(articleFactorSchema).default([]),
  descartado: z.boolean().default(false),
  usado: z.boolean().default(false),
  revisaoLiteratura: z.boolean().default(false),
  duplicateOf: duplicateRefSchema.optional(),
});

export const articlePatchSchema = articleSchema.partial().extend({
  entry: entrySchema.partial().extend({
    fields: z.record(z.string(), z.string()).optional(),
  }).optional(),
});

export const groupSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  versao: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'v1'),
    z.string().min(1),
  ),
  mecanismo: z.preprocess(
    (val) => (typeof val === 'string' ? val : ''),
    z.string(),
  ),
  stringBusca: z.preprocess(
    (val) => (typeof val === 'string' ? val : ''),
    z.string(),
  ),
  createdAt: z.string(),
  articles: z.array(articleSchema),
});

export const referenciasDataSchema = z.object({
  groups: z.array(groupSchema),
});

export const createGroupSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  versao: z.string().min(1).optional().default('v2'),
  mecanismo: z.string().optional().default('Scopus'),
  stringBusca: z.string().optional().default(''),
});

export const updateGroupSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  versao: z.string().min(1).optional(),
  mecanismo: z.string().optional(),
  stringBusca: z.string().optional(),
});

export const createArticleSchema = articleSchema;
