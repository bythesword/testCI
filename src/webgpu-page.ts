import './webgpu-style.css'
import goldenUrl from './webgpu-triangle-golden.png'
import {
  MAX_DIFF_PIXEL_RATIO,
  TRIANGLE_RENDER_HEIGHT,
  TRIANGLE_RENDER_WIDTH,
  alignedBytesPerRow,
  countWhiteAndColoredPixels,
  diffRatioVsRgbaReference,
  probeBufferRoundtrip,
  probeComputeExecution,
  readBackTexturePixels,
  renderTriangleToCanvas,
  renderTriangleToTexture,
  requestWebGpuDevice,
} from './webgpu.ts'

// WebGPU 示例页面刻意保持极简：纯白底色 + 一块 canvas，没有文字、边框和
// 其他底色。GitHub Actions 的无头 Linux 环境对 WebGPU 画布内容的截图不稳定，
// 去掉多余元素后页面只剩单一合成层，便于定位 CI 截图问题。
const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <canvas id="triangle" width="400" height="300"></canvas>
`

const canvas = document.querySelector<HTMLCanvasElement>('#triangle')!

// 读回操作的单次超时时间。SwiftShader 上的 mapAsync 可能一直不 resolve。
const PIXEL_CHECK_TIMEOUT_MS = 10000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 像素比对超差时把实际读回（左）与基准图（右）并排画成 2D 画布。
// CI 无头截图画不了 WebGPU 画布，但 2D 画布可以，失败 artifact 里
// 就能直接看到两边渲染的差异，用于诊断跨平台光栅化差异。
// 本地比对通过时不会出现，因此不影响本地视觉快照。
function drawComparison(
  actualBgra: Uint8Array,
  referenceRgba: Uint8ClampedArray<ArrayBuffer>,
): void {
  const container = document.createElement('div')
  container.id = 'pixel-diff'
  container.style.display = 'flex'
  container.style.gap = '8px'

  const actualCanvas = document.createElement('canvas')
  actualCanvas.width = TRIANGLE_RENDER_WIDTH
  actualCanvas.height = TRIANGLE_RENDER_HEIGHT
  const actualContext = actualCanvas.getContext('2d')!
  const actualImage = actualContext.createImageData(TRIANGLE_RENDER_WIDTH, TRIANGLE_RENDER_HEIGHT)
  const bytesPerRow = alignedBytesPerRow(TRIANGLE_RENDER_WIDTH)
  for (let y = 0; y < TRIANGLE_RENDER_HEIGHT; y++) {
    const rowOffset = y * bytesPerRow
    const imageRowOffset = y * TRIANGLE_RENDER_WIDTH * 4
    for (let x = 0; x < TRIANGLE_RENDER_WIDTH; x++) {
      const offset = rowOffset + x * 4
      const imageOffset = imageRowOffset + x * 4
      actualImage.data[imageOffset] = actualBgra[offset + 2]
      actualImage.data[imageOffset + 1] = actualBgra[offset + 1]
      actualImage.data[imageOffset + 2] = actualBgra[offset]
      actualImage.data[imageOffset + 3] = actualBgra[offset + 3]
    }
  }
  actualContext.putImageData(actualImage, 0, 0)

  const goldenCanvas = document.createElement('canvas')
  goldenCanvas.width = TRIANGLE_RENDER_WIDTH
  goldenCanvas.height = TRIANGLE_RENDER_HEIGHT
  const goldenContext = goldenCanvas.getContext('2d')!
  goldenContext.putImageData(
    new ImageData(referenceRgba, TRIANGLE_RENDER_WIDTH, TRIANGLE_RENDER_HEIGHT),
    0,
    0,
  )

  container.append(actualCanvas, goldenCanvas)
  app.append(container)
}

// 把基准 PNG 解码成 RGBA 像素。基准图由 scripts/generate-webgpu-golden.mjs
// 用同一套离屏渲染路径在本地生成并提交在仓库里，CI 上把读回的像素与它
// 逐像素比对，等价于视觉快照比对（带容差）。
async function decodePngToRgba(url: string): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`加载基准图失败: HTTP ${response.status}`)
  }
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建基准图解码画布')
    }
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data
  } finally {
    bitmap.close()
  }
}

// 页面上不显示任何文字，渲染结果通过 data 属性暴露给测试：
// data-rendered="true" 表示渲染链路全部成功，data-rendered="error" 表示失败，
// 失败原因放在 data-error 里便于排查。
//
// 调用顺序很关键：无头 Linux CI 上，画布渲染提交后浏览器会销毁 WebGPU 设备
// （合成器没有 WebGPU 画布的 backing factory），之后任何 mapAsync 都报
// "A valid external Instance reference no longer exists"。因此所有依赖读回的
// 验证都放在画布渲染之前：
//   1. 纯缓冲区往返探针（data-probe-buffer1）
//   2. compute 执行探针（data-probe-compute）
//   3. 三角形画进离屏纹理后读回统计非白像素（data-pixel-check）
//   4. 渲染到画布（data-rendered，供本地快照与人工查看）
//   5. 画布渲染后的缓冲区往返探针（data-probe-buffer2），确认设备是否已销毁
// 设备丢失时 data-device-lost 记录原因，全部跑完后 data-probes-done="true"。
requestWebGpuDevice()
  .then(async (device) => {
    void device.lost.then((info) => {
      canvas.dataset.deviceLost = `${info.reason}: ${info.message}`
    })

    const record = (name: string, value: string) => {
      canvas.dataset[name] = value
    }

    // 记录 adapter 信息（描述/厂商/架构）：跨平台像素差异可能来自不同的
    // SwiftShader 后端（如 Subzero 与 LLVM），事后从 CI 日志里对照。
    try {
      const adapter = await navigator.gpu.requestAdapter()
      const info = adapter?.info
      record(
        'adapter',
        info ? `${info.description} | ${info.vendor} | ${info.architecture}` : 'none',
      )
    } catch (error: unknown) {
      record('adapter', errorMessage(error))
    }

    try {
      record('probeBuffer1', await probeBufferRoundtrip(device, PIXEL_CHECK_TIMEOUT_MS))
    } catch (error: unknown) {
      record('probeBuffer1', errorMessage(error))
    }

    try {
      record('probeCompute', await probeComputeExecution(device, PIXEL_CHECK_TIMEOUT_MS))
    } catch (error: unknown) {
      record('probeCompute', errorMessage(error))
    }

    try {
      const format = navigator.gpu.getPreferredCanvasFormat()
      const texture = renderTriangleToTexture(
        device,
        format,
        TRIANGLE_RENDER_WIDTH,
        TRIANGLE_RENDER_HEIGHT,
      )
      try {
        const pixels = await readBackTexturePixels(device, texture, PIXEL_CHECK_TIMEOUT_MS)
        if (pixels === 'timeout') {
          canvas.dataset.pixelCheck = 'timeout'
          return
        }
        const { colored, white } = countWhiteAndColoredPixels(pixels, TRIANGLE_RENDER_WIDTH)
        const golden = await decodePngToRgba(goldenUrl)
        if (golden.length !== TRIANGLE_RENDER_WIDTH * TRIANGLE_RENDER_HEIGHT * 4) {
          throw new Error(`基准图尺寸不匹配: ${golden.length / 4} 像素`)
        }
        if (colored <= 1000) {
          canvas.dataset.pixelCheck = 'no-colored-pixels'
          canvas.dataset.pixelStats = `colored=${colored} white=${white}`
          return
        }
        const diff = diffRatioVsRgbaReference(
          pixels,
          golden,
          TRIANGLE_RENDER_WIDTH,
          TRIANGLE_RENDER_HEIGHT,
        )
        canvas.dataset.pixelCheck = diff.diffRatio <= MAX_DIFF_PIXEL_RATIO ? 'ok' : 'diff'
        canvas.dataset.pixelStats =
          `colored=${colored} white=${white} diffRatio=${diff.diffRatio.toFixed(4)} ` +
          `maxDiff=${diff.maxChannelDiff} buckets=${diff.diffBuckets.join('/')}`
        if (canvas.dataset.pixelCheck === 'diff') {
          drawComparison(pixels, golden)
        }
      } finally {
        texture.destroy()
      }
    } catch (error: unknown) {
      canvas.dataset.pixelCheck = 'error'
      canvas.dataset.pixelError = errorMessage(error)
    }

    try {
      renderTriangleToCanvas(device, canvas)
      canvas.dataset.rendered = 'true'
    } catch (error: unknown) {
      canvas.dataset.rendered = 'error'
      canvas.dataset.error = errorMessage(error)
    }

    try {
      record('probeBuffer2', await probeBufferRoundtrip(device, PIXEL_CHECK_TIMEOUT_MS))
    } catch (error: unknown) {
      record('probeBuffer2', errorMessage(error))
    }

    canvas.dataset.probesDone = 'true'
  })
  .catch((error: unknown) => {
    canvas.dataset.rendered = 'error'
    canvas.dataset.error = errorMessage(error)
    canvas.dataset.probesDone = 'true'
  })
