import { expect, test } from '@playwright/test'

// WebGPU 示例页面已刻意简化成“纯白背景 + 一块 canvas”，没有文字、边框和
// 其他底色。渲染完成后页面会把渲染结果写进 canvas 的 data 属性：
// - data-pixel-check="ok"：页面把三角形画进离屏纹理再读回内存，确认真的画了出来；
// - data-rendered="true"：adapter、device、管线创建和 queue 提交全部成功。
// 离屏纹理读回发生在画布渲染之前：无头 Linux 上画布渲染会销毁 WebGPU 设备，
// 之后任何 mapAsync 都报 Vulkan 实例错误，因此验证必须先于画布渲染完成。
test('renders the WebGPU triangle and verifies pixels via GPU readback', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toBeVisible()

  // 先等整条探针序列跑完（每个探针最多 10s），失败时日志里能看到全部
  // data-* 属性，便于定位无头 Linux CI 上读回失效的层级。
  await expect(page.locator('#triangle')).toHaveAttribute('data-probes-done', 'true', {
    timeout: 90000,
  })

  // 像素验证在画布渲染之前完成：无头 Linux CI 上画布渲染会销毁设备，
  // 之后任何 mapAsync 都失败（见 webgpu-page.ts 的调用顺序说明）。
  await expect(page.locator('#triangle')).toHaveAttribute('data-pixel-check', 'ok', {
    timeout: 15000,
  })

  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
})

// 视觉快照只在本地跑：无头 Linux 的合成器不会把 WebGPU 画布内容画进截图
// （已用 CI artifact 证实），CI 上的渲染验证由上面的 GPU 读回用例负责。
test('matches the WebGPU triangle visual snapshot', async ({ page }) => {
  test.skip(process.env.CI === 'true', 'CI 无头环境截不到 WebGPU 画布内容')
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
  await expect(page).toHaveScreenshot('webgpu-triangle.png')
})
