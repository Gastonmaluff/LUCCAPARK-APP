const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')

module.exports = tseslint.config(
  { ignores: ['lib/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['test/**/*.cjs'],
    languageOptions: { globals: { ...globals.node, fetch: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
