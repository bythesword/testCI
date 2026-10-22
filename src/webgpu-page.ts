import './webgpu-style.css'
import { readCanvasPixelStats, renderTriangle } from './webgpu.ts'

// WebGPU 示例页面刻意保持极简：纯白底色 + 一块 canvas，没有文字、边框和
// 其他底色。GitHub Actions 的无头 Linux 环境对 WebGPU 画布内容的截图不稳定，
// 去掉多余元素后页面只剩单一合成层，便于定位 CI 截图问题。
const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <canvas id="triangle" width="400" height="300"></canvas>
`

const canvas = document.querySelector<HTMLCanvasElement>('#triangle')!

// 画布像素读回的超时时间。SwiftShader 上的 mapAsync 可能一直不 resolve，
// 超时后把 data-pixel-check 标记为 timeout，测试失败时能从属性值看出原因。
const PIXEL_CHECK_TIMEOUT_MS = 10000

// 页面上不显示任何文字，渲染结果通过 data 属性暴露给测试：
// data-rendered="true" 表示渲染链路全部成功，data-rendered="error" 表示失败，
// 失败原因放在 data-error 里便于排查。渲染完成后还会把画布纹理读回内存
// 统计非白像素：data-pixel-check="ok" 表示三角形确实被画了出来（不经过
// 合成器，无头 Linux 也能验证），"timeout" 表示读回超时，
// "no-colored-pixels" 表示画布只有白底，统计详情放在 data-pixel-stats。
renderTriangle(canvas)
  .then(async ({ device, context }) => {
    canvas.dataset.rendered = 'true'

    const stats = await readCanvasPixelStats(device, context, PIXEL_CHECK_TIMEOUT_MS)
    if (stats === 'timeout') {
      canvas.dataset.pixelCheck = 'timeout'
      return
    }
    canvas.dataset.pixelCheck = stats.colored > 1000 ? 'ok' : 'no-colored-pixels'
    canvas.dataset.pixelStats = `colored=${stats.colored} white=${stats.white}`
  })
  .catch((error: unknown) => {
    canvas.dataset.rendered = 'error'
    canvas.dataset.error = error instanceof Error ? error.message : String(error)
  })
