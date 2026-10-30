const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/**
 * 平迁代码先保证语法与明显错误可被检查；
 * any / 未使用变量等旧债在 D6 收敛时逐文件清理。
 */
module.exports = [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
