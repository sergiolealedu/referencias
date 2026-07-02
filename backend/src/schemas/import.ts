import { z } from 'zod';

export const bibtexImportSchema = z.object({
  bibtex: z.string().min(1, 'BibTeX é obrigatório'),
  source: z.string().default(''),
  originArticle: z
    .object({
      groupId: z.number(),
      key: z.string().min(1),
    })
    .optional(),
});

export type BibtexImportInput = z.infer<typeof bibtexImportSchema>;
