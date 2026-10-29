import { defineConfig } from '@playwright/test'

export default defineConfig({
  // Playwright 查找测试文件的目录。
  // 本项目的浏览器端用例（视觉快照/E2E）都放这里，与 Vitest 的 src/**/*.test.ts 互不干扰。
  testDir: './tests/e2e',
  // 视觉快照基线目录。toHaveScreenshot() 会在其下按
  // “<测试文件名>-snapshots/” 子目录存放 PNG 基线。
  snapshotDir: './tests/e2e/__snapshots__',
  // 去掉快照文件名里的平台后缀（默认会拼上 win32/linux 等），
  // 让不同系统共用同一份基线，便于本地 Windows 与 CI（Linux）互相兼容。
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}',
  // 所有测试共享的默认浏览器上下文选项，也可在单个测试里覆盖。
  use: {
    // page.goto('/') 这类相对地址的解析基准。
    baseURL: 'http://127.0.0.1:5173',
    // 使用 Chromium 有头模式跑真实硬件 GPU；channel: 'chromium' 避免默认 headless shell。
    channel: 'chromium',
    headless: false,
    // 开启 WebGPU，不加 SwiftShader 参数，让 Chromium 使用本机硬件 GPU。
    launchOptions: {
      args: ['--enable-unsafe-webgpu'],
    },
    // 固定视口尺寸，确保每次截图大小一致、快照可比对。
    viewport: { width: 800, height: 600 },
    // 强制浅色模式，避免跟随系统暗色主题导致快照不稳定。
    colorScheme: 'light',
    // 关闭页面动画/过渡，减少时序抖动对截图的影响。
    reducedMotion: 'reduce',
    // 失败时自动截图保存到 test-results/，便于事后查看页面当时的真实状态
    // （如 WebGPU 像素比对超差时的并排对比图）。
    screenshot: 'only-on-failure',
  },
  // 截图比对的容差配置：本地 Windows 与 CI Linux 的系统字体不同，
  // 逐像素比对会因字体渲染差异误报。放宽到可接受的范围后，
  // 仍能捕捉到明显的内容或布局变化。
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 10000,
      maxDiffPixelRatio: 0.05,
      threshold: 0.3,
    },
  },
  // 运行测试前自动启动本地开发服务器。
  webServer: {
    // 启动 Vite dev server，并固定绑定到 127.0.0.1:5173。
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    // Playwright 用这个地址轮询，判断服务器是否已经就绪。
    url: 'http://127.0.0.1:5173',
    // 本地已有同地址服务时直接复用；CI 环境下不复用，保证环境干净。
    reuseExistingServer: !process.env.CI,
    // 等待服务器就绪的最长时间（毫秒）。
    timeout: 120000,
  },
})
