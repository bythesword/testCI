import './webgpu-style.css'
import {
  TRIANGLE_RENDER_HEIGHT,
  TRIANGLE_RENDER_WIDTH,
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

// 纹理读回的超时时间。SwiftShader 上的 mapAsync 可能一直不 resolve，
// 超时后把 data-pixel-check 标记为 timeout，测试失败时能从属性值看出原因。
const PIXEL_CHECK_TIMEOUT_MS = 10000

// 页面上不显示任何文字，渲染结果通过 data 属性暴露给测试：
// data-rendered="true" 表示渲染链路全部成功，data-rendered="error" 表示失败，
// 失败原因放在 data-error 里便于排查。渲染完成后还会把三角形再画进一块
// 离屏纹理并读回内存统计非白像素：data-pixel-check="ok" 表示三角形确实被画
// 了出来（不经过画布外部共享图和合成器，无头 Linux 也能验证），"timeout"
// 表示读回超时，"no-colored-pixels" 表示纹理只有白底，统计详情放在
// data-pixel-stats。
renderTriangle(canvas)
  .then(async ({ device, format }) => {
    canvas.dataset.rendered = 'true'

    try {
      // 画布纹理的读回在无头 Linux 上会报 Vulkan 实例错误（外部共享图路径
      // 不可用），离屏纹理不经过那条路径，可以安全读回。
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
          return
        }
        canvas.dataset.pixelCheck = stats.colored > 1000 ? 'ok' : 'no-colored-pixels'
        canvas.dataset.pixelStats = `colored=${stats.colored} white=${stats.white}`
      } finally {
        texture.destroy()
      }
    } catch (error: unknown) {
      // 像素读回失败不覆盖 data-rendered 的结论（渲染链路本身是成功的），
      // 单独记到 pixel-check，避免把读回问题误报成渲染失败。
      canvas.dataset.pixelCheck = 'error'
      canvas.dataset.pixelError = error instanceof Error ? error.message : String(error)
    }
  })
  .catch((error: unknown) => {
    canvas.dataset.rendered = 'error'
    canvas.dataset.error = error instanceof Error ? error.message : String(error)
  })
