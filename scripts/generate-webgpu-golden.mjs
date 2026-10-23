// 生成 WebGPU 离屏渲染的基准图（src/webgpu-triangle-golden.png）。
// 用法：npm run generate:webgpu-golden
//
// 流程与 CI 上的验证完全一致：无头 Chromium + SwiftShader，把三角形画进
// 离屏纹理，读回像素后编码为 PNG。页面在 CI 上把读回的像素与这张图逐像素
// 比对，等价于视觉快照比对（带容差）。三角形或渲染参数变更后需要重新生成。
/* global Buffer, ImageData, console, document, navigator */
// 本文件一半跑在 Node（读回后写 PNG），一半在 page.evaluate 里跑在浏览器
// （申请 WebGPU、渲染与像素编码），因此两类全局都要声明。
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const GOLDEN_PATH = 'src/webgpu-triangle-golden.png'

const server = await createServer({ server: { port: 5173, strictPort: false } })
await server.listen()
try {
  const browser = await chromium.launch({
    channel: 'chromium',
    args: [
      '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  })
  try {
    const page = await browser.newPage()
    await page.goto(server.resolvedUrls.local[0])
    const dataUrl = await page.evaluate(async () => {
      const {
        TRIANGLE_RENDER_HEIGHT,
        TRIANGLE_RENDER_WIDTH,
        alignedBytesPerRow,
        readBackTexturePixels,
        renderTriangleToTexture,
        requestWebGpuDevice,
      } = await import('/src/webgpu.ts')

      const device = await requestWebGpuDevice()
      const format = navigator.gpu.getPreferredCanvasFormat()
      const texture = renderTriangleToTexture(
        device,
        format,
        TRIANGLE_RENDER_WIDTH,
        TRIANGLE_RENDER_HEIGHT,
      )
      const pixels = await readBackTexturePixels(device, texture, 10000)
      texture.destroy()
      if (pixels === 'timeout') {
        throw new Error('读回超时')
      }

      // 读回是 bgra8unorm 字节序且按行对齐，转成紧凑 RGBA 的 ImageData 再编码。
      const bytesPerRow = alignedBytesPerRow(TRIANGLE_RENDER_WIDTH)
      const imageData = new ImageData(TRIANGLE_RENDER_WIDTH, TRIANGLE_RENDER_HEIGHT)
      const rgba = imageData.data
      for (let y = 0; y < TRIANGLE_RENDER_HEIGHT; y++) {
        const rowOffset = y * bytesPerRow
        const targetRowOffset = y * TRIANGLE_RENDER_WIDTH * 4
        for (let x = 0; x < TRIANGLE_RENDER_WIDTH; x++) {
          const source = rowOffset + x * 4
          const target = targetRowOffset + x * 4
          rgba[target] = pixels[source + 2]
          rgba[target + 1] = pixels[source + 1]
          rgba[target + 2] = pixels[source]
          rgba[target + 3] = pixels[source + 3]
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = TRIANGLE_RENDER_WIDTH
      canvas.height = TRIANGLE_RENDER_HEIGHT
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('无法创建 PNG 编码画布')
      }
      context.putImageData(imageData, 0, 0)
      return canvas.toDataURL('image/png')
    })

    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    writeFileSync(GOLDEN_PATH, Buffer.from(base64, 'base64'))
    console.log(`已生成 ${GOLDEN_PATH}（${Buffer.byteLength(base64, 'base64')} 字节）`)
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
