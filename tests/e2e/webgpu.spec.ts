import { expect, test } from '@playwright/test'

// GitHub Actions 会设置 CI=true。云端无头 Linux 的 WebGPU 渲染行为不稳定，
// 因此 WebGPU 端到端测试只在本地运行，CI 环境直接跳过。
test.skip(process.env.CI === 'true', 'WebGPU 端到端测试只在本地运行')

test('renders the WebGPU colored triangle', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.getByRole('heading', { name: 'WebGPU 彩色三角形' })).toBeVisible()
  await expect(page.locator('#triangle')).toBeVisible()

  // Linux 无头 Chromium 对 WebGPU 画布内容的截图不可靠，因此这里不做像素断言。
  // 状态文本只有在 adapter、device、管线创建和 GPU queue 提交全部成功后才更新，
  // 所以等待它变成“渲染完成”已经能证明 WebGPU 渲染链路是通的。
  await expect(page.locator('#webgpu-status')).toHaveText('WebGPU 渲染完成')
})
