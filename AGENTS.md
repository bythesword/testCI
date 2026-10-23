# Repository Guidelines

## 项目结构与模块组织

- `src/` — 应用源码与单元测试。入口为 `src/main.ts`，`src/counter.ts` 存放计数器逻辑，`src/style.css` 存放样式。单元测试与代码同目录存放，文件名为 `*.test.ts`。
- `tests/e2e/` — Playwright 端到端测试（`app.spec.ts`），视觉基线位于 `tests/e2e/__snapshots__/`。
- `设计/` — 设计与工程说明文档（中文）。
- `dist/`、`node_modules/`、`test-results/` — 构建或依赖生成的产物，已被 Git 忽略。

配置文件位于仓库根目录：`package.json`、`eslint.config.js`、`vite.config.ts`、`playwright.config.ts`、`.prettierrc.json`、`.editorconfig`。tsconfig 按文件类别拆分：`tsconfig.json` 为解决方案根配置（通过 references 指向三个子项目），`tsconfig.app.json` 覆盖 `src/`，`tsconfig.node.json` 覆盖根目录配置文件，`tsconfig.e2e.json` 覆盖 `tests/e2e/`。

## 构建、测试与开发命令

- `npm run dev` — 启动 Vite 开发服务器，地址为 `http://127.0.0.1:5173`。
- `npm run build` — 先做全量类型检查（`npm run typecheck`），再输出生产构建到 `dist/`。
- `npm run typecheck` — 对 `tsconfig.app.json`、`tsconfig.node.json`、`tsconfig.e2e.json` 三个项目逐一做类型检查，覆盖 `src/`、根目录配置文件与 `tests/e2e/`。
- `npm run lint` — 用 ESLint（typescript-eslint 类型感知规则）检查代码质量。
- `npm run preview` — 本地预览生产构建。
- `npm test` — 运行一次 Vitest 单元测试。
- `npm run test:watch` — 以监听模式运行 Vitest。
- `npm run test:e2e` — 运行 Playwright 测试（会自动启动开发服务器）。**只在本地运行**，远端 CI 不跑。
- `npm run test:e2e:update` — 界面有意变更后重新生成视觉快照基线。
- `npm run format` / `npm run format:check` — 用 Prettier 格式化或校验格式。
- `npm run ci` — 本地全套检查（lint + format:check + build + 单元测试 + e2e）。**push 前必须运行并通过**。

## 代码风格与命名规范

格式由 Prettier 与 `.editorconfig` 统一：2 空格缩进、LF 行尾、不使用分号、单引号、保留尾逗号、每行 100 列。提交前运行 `npm run format`。

TypeScript 开启严格模式（`strict: true`），未使用的局部变量和参数会报错。函数与变量使用 `camelCase`，接口与类型使用 `PascalCase`，文件使用 `kebab-case` 命名。导入写法需符合 `verbatimModuleSyntax`。

代码质量由 ESLint 把关：启用 `@typescript-eslint` 的类型感知推荐规则（通过 `projectService` 复用 tsconfig 项目），`no-explicit-any` 为 error，`no-console` 为 warning。未被任何 tsconfig 项目覆盖的 TS 文件会被 lint 拒绝，因此新增文件必须同时纳入对应 tsconfig 的 `include`。

## 测试指南

- 单元测试：使用 Vitest，放在 `src/**/*.test.ts`，以 `describe`/`it` 组织（参考 `src/counter.test.ts`）。
- 端到端测试：使用 Playwright，位于 `tests/e2e/`，优先使用角色、文本选择器，并用 `toHaveScreenshot()` 做视觉校验。**只在本地运行**（远端 CI 不跑，见上）。
- 用清晰的行为描述命名测试，例如“increments the counter and updates the snapshot”。

## 提交与 Pull Request 规范

仓库目前还没有 Git 提交历史。建议使用 Conventional Commit 格式（`feat:`、`fix:`、`test:`、`chore:`），保持改动聚焦，并在正文中说明原因。Pull Request 应说明改了什么、关联相关 issue，涉及视觉或 UI 变更时附上前后对比截图。仅在有意的变更时通过 `npm run test:e2e:update` 更新快照，并提交更新后的 PNG 文件。

**强制要求：push 前必须在本机执行 `npm run ci` 并全绿。** 检查分为两部分：

- 远端 GitHub CI 只跑不依赖浏览器与 GPU 的检查：`format:check`、`build`（含类型检查）、单元测试。
- Playwright 端到端测试（含 WebGPU 渲染验证与视觉快照）**只在本地运行**。无头 Linux 环境无法稳定渲染 WebGPU 画布（画布渲染会销毁设备、截图抓不到内容、跨平台 SwiftShader 像素差异大），因此远端不跑 e2e，这部分验证由本地的 `npm run test:e2e` 负责。详见 [设计/WebGPU测试说明.md](设计/WebGPU测试说明.md) 与 [设计/CI方法.md](设计/CI方法.md)。
