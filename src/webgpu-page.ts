import './webgpu-style.css'
import {
  TRIANGLE_RENDER_HEIGHT,
  TRIANGLE_RENDER_WIDTH,
  probeBufferRoundtrip,
  probeComputeExecution,
  readBackTexturePixelStats,
  renderTriangle,
  renderTriangleToTexture,
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
// 渲染完成后按序跑一串读回探针，每一步的结果都记进 data 属性，用于定位
// 无头 Linux CI 上 GPU→CPU 读回在哪一层失效：
// - data-probe-buffer1 / data-probe-buffer2：writeBuffer + mapAsync 往返；
// - data-probe-compute：compute shader 写 storage buffer 后 mapAsync 读回；
// - data-pixel-check：三角形画进离屏纹理后拷回内存统计非白像素。
// 设备丢失时 data-device-lost 记录原因。全部跑完后 data-probes-done="true"。
renderTriangle(canvas)
  .then(async ({ device, format }) => {
    canvas.dataset.rendered = 'true'

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
      record('probeBuffer2', await probeBufferRoundtrip(device, PIXEL_CHECK_TIMEOUT_MS))
    } catch (error: unknown) {
      record('probeBuffer2', errorMessage(error))
    }

    canvas.dataset.probesDone = 'true'
  })
  .catch((error: unknown) => {
    canvas.dataset.rendered = 'error'
    canvas.dataset.error = errorMessage(error)
  })
