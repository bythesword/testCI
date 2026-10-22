# ESLint 说明

2026-10-22 引入 ESLint，补齐工程化审计中的“缺口一”（代码质量规则缺失）。本文档记录完整配置、逐块说明与注意事项。引入背景与验证过程见 [持续补齐工程化.md](持续补齐工程化.md)。

## 依赖

- `eslint` 10.13（flat config 是唯一配置格式）
- `typescript-eslint` 8.72（TS 专用规则与类型感知支持）
- `@eslint/js`（ESLint 核心推荐规则集的包）
- `globals`（按运行环境提供全局变量白名单，供 `no-undef` 使用）

## 配置文件全文

[eslint.config.js](../eslint.config.js)（项目是 ESM，配置直接用 ESM 语法写）：

```js
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
```

## 逐块说明

**ignores**：跳过构建产物与测试产物目录。`tests/e2e/__snapshots__` 里只有 PNG，无 TS 文件，属于防御性排除。

**`eslint.configs.recommended`**：ESLint 核心推荐规则（`no-undef`、`no-unused-vars` 等），作用于全部文件，包括 `eslint.config.js` 自己。

**TS 文件块（`**/*.ts`）**：这是配置的核心。

- `tseslint.configs.recommendedTypeChecked`：typescript-eslint 的类型感知推荐集。比非类型版本多出的规则依赖类型信息，能抓普通 lint 抓不到的问题（如浮空 Promise、把 Promise 传给期望同步值的 API）。
- `projectService: true`：lint 时基于 tsconfig 取类型信息。它原生支持解决方案式根配置（`files: []` + references），会按文件归属自动选用 `tsconfig.app/node/e2e` 中的对应项目，无需在 ESLint 里再声明一次文件与 tsconfig 的映射。`tsconfigRootDir` 指向仓库根，是 projectService 定位根 tsconfig 的锚点。
- `globals.browser`：浏览器全局变量白名单（`document`、`window` 等），供 `no-undef` 校验。

**Node 环境文件块**：把 `vite.config.ts`、`playwright.config.ts`、`tests/e2e/**/*.ts` 的 globals 覆盖为 `globals.node`（`process` 等）。flat config 的合并规则是后块覆盖前块，所以这些文件最终拿到的是 node 白名单，而不是上面的 browser。单测文件（`src/**/*.test.ts`）虽然跑在 node 环境，但都通过显式 import 使用 vitest API，不需要 node 全局。

**自定义规则**：

- `@typescript-eslint/no-explicit-any`: error。tsc 的 strict 管不住显式 `any`，这是 ESLint 补位的关键规则。
- `no-console`: warn。允许但不鼓励，不阻断 CI。如需在个别位置保留 console（例如示例页面的调试输出），用 `// eslint-disable-next-line no-console` 并注明原因。

## 注意事项

**新增 TS 文件必须纳入某个 tsconfig 项目。** projectService 会拒绝不在任何 tsconfig `include` 里的 TS 文件，报错形如 `was not found by the project service`。这既是保障（强制覆盖完整性），也容易让人困惑——遇到这个报错先去检查对应的 `tsconfig.*.json` 的 `include`。

**未引入 `eslint-config-prettier`。** typescript-eslint v8 的推荐集不含格式类规则，与 Prettier 无冲突。将来若自行加规则，只加质量类规则；确需格式类规则时再补 `eslint-config-prettier` 避免两套格式打架。

**全局变量按运行环境分块。** 新文件的 globals 归属跟着运行环境走：浏览器代码走默认的 `globals.browser`，跑在 Node 里的配置文件与 e2e 用例需要加进 node 文件块的 `files` 列表。

**lint 在 `ci` 脚本中排第一位**（早于格式检查与构建），让最便宜、最快的问题最先暴露。`no-console` 只是 warning，因此只有 error 才能让 CI 失败。

**lint 与 typecheck 的分工**：类型错误（含 `strict` 相关）由 `npm run typecheck` 负责；lint 负责类型系统管不住的质量规则（any、console、浮空 Promise 等）。两者都跑，不要用其中一个替代另一个。

**编辑器**：VS Code 装 ESLint 插件即可获得与 CLI 一致的实时反馈；projectService 模式下插件会自动跟随 tsconfig 配置。

## 验证方法

配置或规则调整后，用临时文件做“真实性”验证，确认规则确实生效而不是空跑：

```bash
printf 'const x: any = 1\nconsole.log(x)\n' > src/_eslint-check.ts
npx eslint src/_eslint-check.ts   # 期望：no-explicit-any error + no-console warning
rm src/_eslint-check.ts
```

再跑 `npm run lint` 确认正式代码零告警。
