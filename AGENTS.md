# Repository Guidelines

## 项目结构与模块组织

- `src/` — 应用源码与单元测试。入口为 `src/main.ts`，`src/counter.ts` 存放计数器逻辑，`src/style.css` 存放样式。单元测试与代码同目录存放，文件名为 `*.test.ts`。
- `tests/e2e/` — Playwright 端到端测试（`app.spec.ts`），视觉基线位于 `tests/e2e/__snapshots__/`。
- `设计/` — 设计与工程说明文档（中文）。
- `dist/`、`node_modules/`、`test-results/` — 构建或依赖生成的产物，已被 Git 忽略。

配置文件位于仓库根目录：`package.json`、`tsconfig.json`、`vite.config.ts`、`playwright.config.ts`、`.prettierrc.json`、`.editorconfig`。

## 构建、测试与开发命令

- `npm run dev` — 启动 Vite 开发服务器，地址为 `http://127.0.0.1:5173`。
- `npm run build` — 先用 `tsc --noEmit` 做类型检查，再输出生产构建到 `dist/`。
- `npm run preview` — 本地预览生产构建。
- `npm test` — 运行一次 Vitest 单元测试。
- `npm run test:watch` — 以监听模式运行 Vitest。
- `npm run test:e2e` — 运行 Playwright 测试（会自动启动开发服务器）。
- `npm run test:e2e:update` — 界面有意变更后重新生成视觉快照基线。
- `npm run format` / `npm run format:check` — 用 Prettier 格式化或校验格式。

## 代码风格与命名规范

格式由 Prettier 与 `.editorconfig` 统一：2 空格缩进、LF 行尾、不使用分号、单引号、保留尾逗号、每行 100 列。提交前运行 `npm run format`。

TypeScript 开启严格模式（`strict: true`），未使用的局部变量和参数会报错。函数与变量使用 `camelCase`，接口与类型使用 `PascalCase`，文件使用 `kebab-case` 命名。导入写法需符合 `verbatimModuleSyntax`。

## 测试指南

- 单元测试：使用 Vitest，放在 `src/**/*.test.ts`，以 `describe`/`it` 组织（参考 `src/counter.test.ts`）。
- 端到端测试：使用 Playwright，位于 `tests/e2e/`，优先使用角色、文本选择器，并用 `toHaveScreenshot()` 做视觉校验。
- 用清晰的行为描述命名测试，例如“increments the counter and updates the snapshot”。

## 提交与 Pull Request 规范

仓库目前还没有 Git 提交历史。建议使用 Conventional Commit 格式（`feat:`、`fix:`、`test:`、`chore:`），保持改动聚焦，并在正文中说明原因。Pull Request 应说明改了什么、关联相关 issue，涉及视觉或 UI 变更时附上前后对比截图。仅在有意的变更时通过 `npm run test:e2e:update` 更新快照，并提交更新后的 PNG 文件。
