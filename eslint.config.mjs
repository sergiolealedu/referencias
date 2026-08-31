import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * O projeto não tinha linter, e deu para ver: o `App.tsx` inteiro duplo-espaçado
 * e imports/parâmetros mortos que só apareceram quando `noUnusedLocals` entrou
 * no tsconfig.
 *
 * As regras aqui são as que apontam defeito, não estilo. Formatação é assunto do
 * Prettier (`npm run format`), que não faz parte do CI: reformatar 16 mil linhas
 * de uma vez enterraria qualquer diff de verdade, e essa é uma decisão de quem
 * mantém, não deste config.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'frontend/android/**',
      '**/*.tsbuildinfo',
      'release/**',
      'data/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // O `_` na frente marca "não uso de propósito" — sem isso não há como
      // escrever um parâmetro posicional que só existe para chegar ao próximo.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // 16 mil linhas sem um único `any`: a regra sustenta isso.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'off',
    },
  },

  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  {
    // Teste usa `!` para afirmar o que a asserção anterior já garantiu; exigir
    // checagem em cada linha só polui o teste.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs', '*.config.js', '*.config.mjs', '*.config.ts'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
        // Globais de plataforma que o Node já traz — `crossref-bibtex.mjs`
        // consulta a API do Crossref sem nenhuma dependência por causa deles.
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
);
