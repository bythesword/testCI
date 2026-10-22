import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'test-results',
      'playwright-report',
      'tests/e2e/__snapshots__',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // 基于 tsconfig 做类型感知检查。projectService 原生支持
        // 解决方案式根配置（files: [] + references），会按文件归属
        // 自动选用 tsconfig.app/node/e2e 中的对应项目。
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // 运行在 Node 环境的 TS 文件：构建配置与 Playwright 用例。
    files: ['vite.config.ts', 'playwright.config.ts', 'tests/e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
