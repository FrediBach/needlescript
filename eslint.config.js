import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';

export default defineConfig([
  globalIgnores(['dist', 'dist-lib']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // These component modules intentionally export their class-variance helpers
  // for composition by neighbouring UI primitives.
  {
    files: ['src/components/ui/{badge,button,tabs,toggle}.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // TanStack Virtual's hook returns imperative helpers, so React Compiler
  // deliberately skips this component. The hook is otherwise used correctly.
  {
    files: ['src/components/svg-staging/ElementList.tsx'],
    rules: {
      'react-hooks/incompatible-library': 'off',
    },
  },
]);
