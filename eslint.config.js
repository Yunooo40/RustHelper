// Flat ESLint config (ESLint 9+). Run with `npm run lint`.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'data/**', 'coverage/**', '**/*.sqlite*'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Allow intentionally-unused args/vars prefixed with "_" (e.g. Express
      // error handlers: (err, _req, res, _next)).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
