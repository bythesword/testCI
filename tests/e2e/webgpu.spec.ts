import { expect, test } from '@playwright/test'

// WebGPU 示例页面已刻意简化成“纯白背景 + 一块 canvas”，没有文字、边框和
// 其他底色。渲染完成后页面会把渲染结果写进 canvas 的 data 属性：
// - data-rendered="true"：adapter、device、管线创建和 queue 提交全部成功；
// - data-pixel-check="ok"：页面把画布纹理读回内存，确认三角形真的画了出来。
// GPU 读回不经过合成器，因此无头 Linux 的 CI 环境也能用它验证渲染结果。
test('renders the WebGPU triangle and verifies pixels via GPU readback', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toBeVisible()

  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')

  await expect(page.locator('#triangle')).toHaveAttribute('data-pixel-check', 'ok', {
    timeout: 15000,
  })
})

// 视觉快照在本地和 CI 都跑：CI 用 Xvfb 虚拟显示器跑有头 Chromium，
// 合成器会把 WebGPU 画布内容画进截图（无头模式做不到，已用 artifact 证实）。
test('matches the WebGPU triangle visual snapshot', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
  await expect(page).toHaveScreenshot('webgpu-triangle.png')
})
