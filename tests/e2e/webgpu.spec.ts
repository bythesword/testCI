import { expect, test } from '@playwright/test'

// WebGPU 示例页面已刻意简化成“纯白背景 + 一块 canvas”，没有文字、边框和
// 其他底色。渲染完成后页面会给 canvas 加 data-rendered="true"，测试等待该
// 属性出现，再对整页截图做视觉快照比对，验证画布上确实画出了彩色三角形。
test('renders the WebGPU colored triangle', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.locator('#triangle')).toBeVisible()

  // 状态只有在 adapter、device、管线创建和 GPU queue 提交全部成功后才更新，
  // 等待 data-rendered="true" 出现就能证明 WebGPU 渲染链路是通的。
  await expect(page.locator('#triangle')).toHaveAttribute('data-rendered', 'true')

  // 页面只有纯白背景和三角形，快照里不包含任何文字或边框。SwiftShader 是
  // 软件渲染器，同一 Chromium 版本在 Windows 与 Linux 上的输出应当一致，
  // 因此这份基线可以跨平台共用；若 CI 上截图丢掉了画布内容，这里会直接失败。
  await expect(page).toHaveScreenshot('webgpu-triangle.png')
})
