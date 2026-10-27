import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Синхронизация формы с данными сервера в эффекте — осознанный паттерн проекта.
      'react-hooks/set-state-in-effect': 'off',
      // Инициализация переменной перед ветвлением не является ошибкой.
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['scripts/**/*.{ts,mjs,js}', '*.config.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
);
