import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The simulation stays pure and deterministic: no DOM, no clock, no
    // ambient randomness. That is what lets the tests and the level solver
    // step it thousands of times in Node.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'The sim is deterministic; no Math.random.' }],
      'no-restricted-globals': ['error', 'document', 'window', 'performance', 'Date', 'requestAnimationFrame'],
    },
  },
);
