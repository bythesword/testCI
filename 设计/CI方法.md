# CI 方法与过程

本文档整理本项目的 CI 方案：本地一键检查与 GitHub Actions 自动化，以及落地过程中遇到的关键问题和注意事项。

## 流水线总览

CI 的核心是同一套检查在两种环境里运行：本机手动/一键，以及 GitHub Actions 自动。检查分为四步，对应 `package.json` 里的脚本：

1. `npm run format:check`：Prettier 格式检查。
2. `npm run build`：先 `tsc --noEmit` 做类型检查，再 `vite build` 产出构建。
3. `npm test`：Vitest 单元测试。
4. `npm run test:e2e`：Playwright 端到端测试（含视觉快照比对）。

## 本地方式

本地可以直接依次执行上面四条命令模拟 CI；更省事的是用一条 `ci` 脚本一次跑完。`package.json` 中：

```json
"ci": "npm run format:check && npm run build && npm test && npm run test:e2e"
```

之后执行 `npm run ci` 即完成一次本地流水线。

前置条件：首次跑 e2e 前需要安装 Playwright 浏览器，执行一次 `npx playwright install`。

另一种“本地”是真正在本地运行 GitHub Actions：安装 Docker 后执行 `act`，它会读取 `.github/workflows/ci.yml` 在本地容器里跑同一套工作流，适合推送到 GitHub 前自测。

## GitHub 方式

### 前置条件

1. 初始化 Git 仓库，并把默认分支设为 `main`（与工作流触发分支一致）。
2. 在 GitHub 上创建仓库，把本地提交推上去。
3. 推送需要认证：可以用 GitHub CLI 的 `gh auth login`、Git Credential Manager 的浏览器登录，或 Personal Access Token。

### 工作流

工作流文件位于 `.github/workflows/ci.yml`：

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

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: Run end-to-end tests
        run: npm run test:e2e

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore
```

### 关键点

- 用 `npm ci` 而非 `npm install`：仓库有 `package-lock.json`，`npm ci` 按锁文件安装，结果可复现。
- e2e 直接跑无头 Chromium。无头 Linux 的合成器不会把 WebGPU 画布内容画进截图，且画布渲染会销毁 WebGPU 设备、导致之后的 GPU 读回报 Vulkan 实例错误，因此 WebGPU 的视觉快照用例在 CI 上跳过，渲染验证由页面内**先于画布渲染**执行的“离屏渲染 + 基准图逐像素比对”断言负责（详见 [WebGPU测试说明.md](WebGPU测试说明.md)）。
- GitHub Actions 会自动设置 `CI=true`；`playwright.config.ts` 里 `reuseExistingServer: !process.env.CI` 据此在 CI 下不复用已有服务。
- Linux runner 缺少浏览器运行所需的系统依赖，`npx playwright install --with-deps chromium` 一步装齐。
- 失败时把 `playwright-report/` 与 `test-results/` 作为 artifact 上传，便于事后定位截图差异。

## 快照跨平台处理

视觉快照基线默认会带上平台后缀（Windows 为 `-win32`），导致 Windows 与 Linux 各找各的基线。为了本地与 CI 共用同一份基线，在 `playwright.config.ts` 里显式指定：

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

- 提交前保持 `npm run format:check` 全绿。`设计/` 下的中文文档同样会被 Prettier 检查，新增文档后先跑 `npm run format` 再提交。
- Node 版本需满足 Vite 的要求（`^20.19.0 || >=22.12.0`），工作流当前固定为 Node 24。
- GitHub 官方 actions（checkout/setup-node/upload-artifact 的 v4）目前会报“Node.js 20 is deprecated”的警告，属于非阻塞提示，后续可升级到新版本。
- `ubuntu-latest` 镜像会滚动升级（提示将迁移到 Ubuntu 26），若 e2e 突然失败，先核对 runner 镜像和字体包是否变化。
- 首次在 Linux 上跑视觉快照如果仍因渲染差异失败，可以适当调整容差，或确认两边使用同一字体。
- 推送需要 GitHub 认证；本地没有 GitHub CLI 或 Token 时，用 Git Credential Manager 完成浏览器登录即可缓存凭据。
