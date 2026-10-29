import { expect, test } from '@playwright/test'

// 默认在硬件 GPU 上跑：有头 Chromium 使用本机显卡渲染 WebGPU，页面通过
// data-* 属性暴露渲染结果与读回比对结果。SwiftShader 仅在 ?golden=sw 时
// 作为可选回退，由 scripts/generate-webgpu-golden.mjs 维护对应基准图。
test('renders the WebGPU triangle on hardware GPU', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toBeVisible()

  await expect(page.locator('#triangle')).toHaveAttribute('data-probes-done', 'true', {
    timeout: 90000,
  })

  // 确认真用的是硬件 adapter，而不是 SwiftShader 软件渲染。
  const adapter = await page.locator('#triangle').getAttribute('data-adapter')
  expect(adapter ?? '').toBeTruthy()
  expect(adapter ?? '').not.toMatch(/swiftshader/i)

  await expect(page.locator('#triangle')).toHaveAttribute('data-pixel-check', 'ok', {
    timeout: 15000,
  })
  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
})

test('matches the WebGPU triangle visual snapshot', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')
  await expect(page).toHaveScreenshot('webgpu-triangle.png')
})
