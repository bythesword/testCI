import { expect, test } from '@playwright/test'

test('renders the WebGPU colored triangle', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.getByRole('heading', { name: 'WebGPU 彩色三角形' })).toBeVisible()
  await expect(page.locator('#webgpu-status')).toHaveText('WebGPU 渲染完成')
  await expect(page).toHaveScreenshot('webgpu-triangle.png')
})
