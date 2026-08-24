import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Um runner só para os dois workspaces: os testes cobrem regras puras
    // (categorias, fatores, BibTeX, tokens) e um SQLite em memória, nada que
    // precise de DOM ou de servidor de pé.
    include: ['backend/**/*.test.ts', 'frontend/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/android/**'],
    environment: 'node',
  },
});
