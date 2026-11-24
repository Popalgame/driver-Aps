import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  {
    files: ['site/src/**/*.js'],
    languageOptions: { sourceType: 'module', ecmaVersion: 'latest', globals: globals.browser },
    rules: { ...js.configs.recommended.rules, 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    files: ['site/sw.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 'latest', globals: globals.serviceworker },
    rules: js.configs.recommended.rules,
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 'latest', globals: globals.node },
    rules: js.configs.recommended.rules,
  },
];
