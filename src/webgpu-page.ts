import './webgpu-style.css'
import {
  TRIANGLE_RENDER_HEIGHT,
  TRIANGLE_RENDER_WIDTH,
  probeBufferRoundtrip,
  probeComputeExecution,
  readBackTexturePixelStats,
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
        const stats = await readBackTexturePixelStats(device, texture, PIXEL_CHECK_TIMEOUT_MS)
        if (stats === 'timeout') {
          canvas.dataset.pixelCheck = 'timeout'
        } else {
          canvas.dataset.pixelCheck = stats.colored > 1000 ? 'ok' : 'no-colored-pixels'
          canvas.dataset.pixelStats = `colored=${stats.colored} white=${stats.white}`
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
