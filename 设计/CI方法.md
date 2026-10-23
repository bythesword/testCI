# CI 方法与过程

本文档整理本项目的 CI 方案：本地全套检查与 GitHub Actions 远端检查的分工，以及落地过程中遇到的关键问题和注意事项。

## 总览：本地与远端的分工

检查分为静态检查和浏览器端检查两类：

- 静态检查（不依赖浏览器与 GPU）：`npm run format:check`（格式）、`npm run build`（类型检查 + 构建）、`npm test`（Vitest 单元测试）。
- 浏览器端检查：`npm run test:e2e`（Playwright 端到端测试，含 WebGPU 渲染验证与视觉快照）。

**分工的最终定论：**

- **远端 GitHub CI 只跑静态检查**（format + build + 单元测试）。
- **Playwright 端到端测试只在本地运行**。无头 Linux 环境无法稳定渲染 WebGPU 画布：画布渲染会销毁 WebGPU 设备（之后所有 GPU 读回报 Vulkan 实例错误）、合成器不会把 WebGPU 画布内容画进截图、跨平台 SwiftShader 的像素级渲染差异大（与本地基准图有约 15% 像素超差）。详见 [WebGPU测试说明.md](WebGPU测试说明.md)。
- 因此 **强制要求：push 前必须在本机执行 `npm run ci` 并全部通过**。`npm run ci` = lint + format:check + build + 单元测试 + e2e，一条命令跑完本地全套检查。

## 本地方式

直接执行 `npm run ci` 即完成一次本地流水线：

```json
"ci": "npm run lint && npm run format:check && npm run build && npm test && npm run test:e2e"
```

前置条件：首次跑 e2e 前需要安装 Playwright 浏览器，执行一次 `npx playwright install`。

另一种“本地”是真正在本地运行 GitHub Actions：安装 Docker 后执行 `act`，它会读取 `.github/workflows/ci.yml` 在本地容器里跑同一套工作流，适合推送到 GitHub 前自测（只覆盖远端那部分静态检查）。

## GitHub 方式

### 前置条件

1. 初始化 Git 仓库，并把默认分支设为 `main`（与工作流触发分支一致）。
2. 在 GitHub 上创建仓库，把本地提交推上去。
3. 推送需要认证：可以用 GitHub CLI 的 `gh auth login`、Git Credential Manager 的浏览器登录，或 Personal Access Token。

### 工作流

工作流文件位于 `.github/workflows/ci.yml`，只包含静态检查：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Check formatting
        run: npm run format:check

      - name: Build and type check
        run: npm run build

      - name: Run unit tests
        run: npm test
```

### 关键点

- 用 `npm ci` 而非 `npm install`：仓库有 `package-lock.json`，`npm ci` 按锁文件安装，结果可复现。
- 远端不跑 Playwright：无头 Linux 上 WebGPU 画布渲染会销毁设备、截图抓不到画布内容、跨平台 SwiftShader 像素差异大，e2e 与视觉验证全部由本地的 `npm run ci` 负责（详见 [WebGPU测试说明.md](WebGPU测试说明.md)）。
- GitHub Actions 会自动设置 `CI=true`；`playwright.config.ts` 里 `reuseExistingServer: !process.env.CI` 据此在 CI 下不复用已有服务（该配置仅影响本地自测时的行为）。
- 浏览器端验证（渲染正确性、视觉快照）不在远端跑，push 前必须本地全绿——这是硬性要求，远端 CI 无法兜底这一部分。

## 快照跨平台处理

视觉快照基线默认会带上平台后缀（Windows 为 `-win32`），导致 Windows 与 Linux 各找各的基线。为了让本机不同系统（或将来换用 Linux 开发机）共用同一份基线，在 `playwright.config.ts` 里显式指定：

```ts
snapshotPathTemplate: '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}'
```

基线文件名相应变为不带平台后缀的 `counter-initial.png`、`counter-incremented.png`。

即便基线一致，Windows 与 Linux 的系统字体渲染仍有差异（本页使用 `system-ui`），逐像素比对会误报。因此为截图比对配置了容差：

```ts
expect: {
  toHaveScreenshot: {
    maxDiffPixels: 10000,
    maxDiffPixelRatio: 0.05,
    threshold: 0.3,
  },
}
```

这样既能容忍跨平台字体渲染差异，又能捕捉明显的内容或布局变化。若后续 UI 有意变更，仍可用 `npm run test:e2e:update` 重新生成基线。

## 注意事项

- **push 前必须执行 `npm run ci` 并全绿**。远端 CI 只检查静态部分，e2e（含 WebGPU 渲染验证与视觉快照）只有本地能兜底。
- 提交前保持 `npm run format:check` 全绿。`设计/` 下的中文文档同样会被 Prettier 检查，新增文档后先跑 `npm run format` 再提交。
- Node 版本需满足 Vite 的要求（`^20.19.0 || >=22.12.0`），工作流当前固定为 Node 24。
- GitHub 官方 actions（checkout/setup-node 的 v4）目前会报“Node.js 20 is deprecated”的警告，属于非阻塞提示，后续可升级到新版本。
- `ubuntu-latest` 镜像会滚动升级（提示将迁移到 Ubuntu 26），若远端 CI 突然失败，先核对 runner 镜像变化。
- 推送需要 GitHub 认证；本地没有 GitHub CLI 或 Token 时，用 Git Credential Manager 完成浏览器登录即可缓存凭据。
