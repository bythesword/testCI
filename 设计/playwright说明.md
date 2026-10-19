已给 [playwright.config.ts](F:/tools/test/PJ1/playwright.config.ts) 加了逐项中文注解，并用 `npx playwright test --list` 验证过配置可正常解析（能列出 2 个用例），文件本身也通过了 Prettier 检查。

当前配置各字段的作用可以概括为：

- `testDir`：Playwright 只在 `tests/e2e` 里找用例，和 Vitest 的 `src/*.test.ts` 彻底分开。
- `snapshotDir`：`toHaveScreenshot()` 写基线的地方，按“测试文件名-snapshots”建子目录。
- `use`：默认浏览器上下文。`baseURL` 解析相对地址，`viewport` 固定截图尺寸，`colorScheme: 'light'` 和 `reducedMotion: 'reduce'` 都是为了保证快照稳定。
- `webServer`：测试前自动拉起 Vite dev server，轮询 `url` 等它就绪，本地复用已有服务、CI 不复用，`timeout` 是等待上限。

其他几个值得了解的 Playwright 功能，单独说明如下。

快照比对容差：`expect(page).toHaveScreenshot('x.png', { maxDiffPixels: 100, maxDiffPixelRatio: 0.01, threshold: 0.2 })` 可以允许少量像素差异，适合抗字体渲染之类的轻微抖动。当前项目没设，是“必须逐像素完全一致”的最严格模式。

跨平台快照：现在基线文件名带 `-win32`，是 Playwright 默认给当前平台加的标识。想让 macOS/Linux 共用同一份基线，可以在配置里加 `snapshotPathTemplate: '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}'`，去掉平台后缀。

更新模式：`--update-snapshots` 会重写基线，适合改版后有意更新；日常回归只用 `playwright test`。也可以只对部分用例更新，例如 `npx playwright test -g "initial" --update-snapshots`。

用例筛选：`npx playwright test --grep "initial"` 按名称筛选，`--project` 按项目筛选。适合本地只想跑某一个快照时使用。

多浏览器/多设备：可以在配置里加 `projects` 数组，用 `devices['Desktop Chrome']`、`devices['iPhone 12']` 等定义多套视口和浏览器，同一份用例会各跑一遍。当前最小项目只有默认 Chromium 单一环境。

运行与报告：`workers` 控制并行度，`fullyParallel: true` 让同一文件里的用例也能并行，`retries` 在 CI 里做失败重试，`reporter: [['html', { open: 'never' }]]` 生成 HTML 报告，`outputDir` 指定 `test-results` 等产物目录。这些当前都没显式配置，走的是默认值。

另外提醒一句：我跑 `npm run format:check` 时发现新出现的 `设计/工程建立描述.md` 和 `设计/计划.md` 两个文档不满足 Prettier 格式（所以全量 `format:check` 现在会失败）。这是你新增的文件，我没有动它们；如果需要让检查恢复全绿，要么在 `.prettierignore` 里忽略 `设计` 目录，要么跑一次 `npm run format` 把它们一起格式化。需要我处理的话告诉我用哪种方式。
