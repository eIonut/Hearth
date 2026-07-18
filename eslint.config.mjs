import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: ['client/dist/**', 'data/**', 'envs/**', 'backups/**', '**/node_modules/**'],
  },

  js.configs.recommended,

  // Server: Node + ESM
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Client app: browser + ESM + JSX + React
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Off: this app's pages load their data in mount effects (setState in the
      // effect body is the intended pattern here). Revisit in the Phase 4 client
      // refactor if any of these effects are reworked.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // Client tooling config: Node + ESM
  {
    files: ['client/vite.config.js', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
