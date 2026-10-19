import { expect, test } from '@playwright/test'

test('renders the WebGPU colored triangle', async ({ page }) => {
  await page.goto('/webgpu.html')
  await expect(page.getByRole('heading', { name: 'WebGPU 彩色三角形' })).toBeVisible()
  await expect(page.locator('#webgpu-status')).toHaveText('WebGPU 渲染完成')

  // WebGPU 在 Windows 与 Linux 上的抗锯齿会有差异，直接做像素级快照比对
  // 会因平台差异误报。这里改为截图后统计红、绿、蓝三种颜色的像素数量，
  // 只要能同时检测到三种颜色，就说明彩色三角形确实渲染出来了。
  const screenshot = await page.screenshot()
  const colorCounts = await page.evaluate(
    async (dataUrl) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('无法创建 2D 上下文用于像素检查')
      }

      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

      let red = 0
      let green = 0
      let blue = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (r > 200 && g < 120 && b < 120) {
          red += 1
        }
        if (g > 200 && r < 120 && b < 120) {
          green += 1
        }
        if (b > 200 && r < 120 && g < 120) {
          blue += 1
        }
      }

      return { red, green, blue }
    },
    `data:image/png;base64,${screenshot.toString('base64')}`,
  )

  expect(colorCounts.red).toBeGreaterThan(200)
  expect(colorCounts.green).toBeGreaterThan(200)
  expect(colorCounts.blue).toBeGreaterThan(200)
})
