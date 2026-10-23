import { expect, test } from '@playwright/test'

// 本文件只在本地运行：远端 GitHub CI 不跑 Playwright（无头 Linux 上 WebGPU
// 画布渲染会销毁设备、截图抓不到画布内容、跨平台 SwiftShader 像素差异大，
// 详见 设计/WebGPU测试说明.md），push 前必须本地 npm run ci 全绿。
//
// WebGPU 示例页面已刻意简化成“纯白背景 + 一块 canvas”，没有文字、边框和
// 其他底色。渲染完成后页面会把渲染结果写进 canvas 的 data 属性：
// - data-pixel-check="ok"：页面把三角形画进离屏纹理，读回像素并与仓库里的
//   基准图（src/webgpu-triangle-golden.png）逐像素比对，确认渲染内容与预期一致；
// - data-rendered="true"：adapter、device、管线创建和 queue 提交全部成功。
// 离屏读回与比对发生在画布渲染之前：无头 Linux 上画布渲染会销毁 WebGPU 设备，
// 之后任何 mapAsync 都报 Vulkan 实例错误，因此验证必须先于画布渲染完成
// （本机 Windows 上顺序同样适用）。
test('renders the WebGPU triangle and verifies pixels via GPU readback', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toBeVisible()

  // 先等整条探针序列跑完（每个探针最多 10s），失败时日志里能看到全部
  // data-* 属性，便于定位读回失效的层级。
  await expect(page.locator('#triangle')).toHaveAttribute('data-probes-done', 'true', {
    timeout: 90000,
  })

  // 像素验证在画布渲染之前完成（见 webgpu-page.ts 的调用顺序说明）。
  await expect(page.locator('#triangle')).toHaveAttribute('data-pixel-check', 'ok', {
    timeout: 15000,
  })

  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
})

// 视觉快照确认画布上真的显示出了三角形，与上面的 GPU 读回验证互为补充。
test('matches the WebGPU triangle visual snapshot', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
  await expect(page).toHaveScreenshot('webgpu-triangle.png')
})
