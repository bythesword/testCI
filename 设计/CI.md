这个项目做 CI，本质是把同一套检查在两种环境里跑：本机手动/一键跑，以及 GitHub Actions 自动跑。核心流水线就是四步：格式检查 → 构建（含类型检查）→ 单元测试 → 端到端测试，对应仓库里现成的四个 npm 脚本。

## 本地方式

最直接的做法是依次执行这几条，模拟 CI 会做的事：

```
npm run format:check
npm run build
npm test
npm run test:e2e
```

其中 `npm run build` 已经先跑 `tsc --noEmit` 再做 `vite build`，所以类型检查被覆盖了；`npm run test:e2e` 需要先装过 Playwright 浏览器（一次性的 `npx playwright install`）。

想一键跑完，可以在 `package.json` 加一个 `ci` 脚本：

```
"ci": "npm run format:check && npm run build && npm test && npm run test:e2e"
```

之后本地只要 `npm run ci` 就是一次完整流水线。另一种“本地”是真正在本地跑 GitHub Actions：装好 Docker 后执行 `act`，它会读取 `.github/workflows/ci.yml` 在本地容器里执行，适合上线前先自测工作流。

## GitHub 方式

GitHub 方式就是加一个 `.github/workflows/ci.yml`。这个仓库目前还不是 Git 仓库（`git status` 直接报 not a git repository），所以第一步是 `git init`、在 GitHub 建仓库、推送上去，之后工作流才会生效。

工作流内容可以这样写：

```
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: 安装依赖
        run: npm ci

      - name: 格式检查
        run: npm run format:check

      - name: 构建与类型检查
        run: npm run build

      - name: 单元测试
        run: npm test

      - name: 安装 Playwright 浏览器
        run: npx playwright install --with-deps chromium

      - name: 端到端测试
        run: npm run test:e2e

      - name: 上传失败产物
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore
```

几个关键点：用 `npm ci` 而不是 `npm install`，因为有 `package-lock.json`，这样安装可复现；GitHub 会自动设置 `CI=true`，而你的 `playwright.config.ts` 已经靠 `process.env.CI` 判断是否复用 dev server，所以无需额外配置；Playwright 在 Ubuntu 上需要系统依赖，`--with-deps` 一步装好。项目小，单 job 顺序跑就够了；以后想加速再拆成单元测试和 e2e 两个并行 job。

## 上线前要解决的三个坑

我实际查了一下，当前仓库直接接 CI 会红，有三处需要先处理：

一是 `npm run format:check` 现在就是失败的，报 `设计/playwright多个配置.md` 不符合 Prettier 格式。要么跑 `npm run format` 把它格式化，要么在 `.prettierignore` 里忽略 `设计` 目录。

二是快照跨平台问题。你的基线文件是 `counter-initial-win32.png` 这种带 `-win32` 后缀的名字，是 Playwright 按平台自动加的；GitHub 的 Linux runner 会去找 `-linux` 版本，现有基线对不上，e2e 必挂。按你 `设计/playwright说明.md` 里写的方案，在 `playwright.config.ts` 加一行去掉平台后缀：

```
snapshotPathTemplate: '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}',
```

然后把两个基线文件重命名成 `counter-initial.png`、`counter-incremented.png`（或直接删掉后用 `npm run test:e2e:update` 重新生成）。

三是没有 `.git`。GitHub 方式的前提是先初始化仓库并推送，这个我可以顺带一起处理。
