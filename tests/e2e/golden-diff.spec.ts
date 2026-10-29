/* global document, Image */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const SOFTWARE_GOLDEN = 'src/webgpu-triangle-golden.png'
const HARDWARE_GOLDEN = 'src/webgpu-triangle-golden-gpu.png'
// 与 src/webgpu.ts 的 PIXEL_DIFF_THRESHOLD / MAX_DIFF_PIXEL_RATIO 保持一致。
const PIXEL_DIFF_THRESHOLD = 0.3
const MAX_DIFF_PIXEL_RATIO = 0.05

test('software and hardware golden images stay within the pixel threshold', async ({ page }) => {
  const software = readFileSync(SOFTWARE_GOLDEN).toString('base64')
  const hardware = readFileSync(HARDWARE_GOLDEN).toString('base64')

  const result = await page.evaluate(
    async ({ software, hardware, threshold }) => {
      const decode = async (dataUrl: string) => {
        const image = new Image()
        image.src = dataUrl
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('无法创建解码画布')
        }
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, image.width, image.height)
      }

      const softwarePixels = await decode(software)
      const hardwarePixels = await decode(hardware)
      if (
        softwarePixels.width !== hardwarePixels.width ||
        softwarePixels.height !== hardwarePixels.height
      ) {
        throw new Error('两张基准图尺寸不一致')
      }

      const total = softwarePixels.width * softwarePixels.height
      const limit = threshold * 255
      let diffPixels = 0
      let maxChannelDiff = 0
      for (let i = 0; i < total; i++) {
        const offset = i * 4
        const channelDiff = Math.max(
          Math.abs(softwarePixels.data[offset] - hardwarePixels.data[offset]),
          Math.abs(softwarePixels.data[offset + 1] - hardwarePixels.data[offset + 1]),
          Math.abs(softwarePixels.data[offset + 2] - hardwarePixels.data[offset + 2]),
        )
        if (channelDiff > maxChannelDiff) {
          maxChannelDiff = channelDiff
        }
        if (channelDiff > limit) {
          diffPixels += 1
        }
      }

      return { total, diffPixels, diffRatio: diffPixels / total, maxChannelDiff }
    },
    {
      software: `data:image/png;base64,${software}`,
      hardware: `data:image/png;base64,${hardware}`,
      threshold: PIXEL_DIFF_THRESHOLD,
    },
  )

  expect(result.diffRatio).toBeLessThanOrEqual(MAX_DIFF_PIXEL_RATIO)
})
