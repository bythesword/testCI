import './webgpu-style.css'
import { renderTriangle } from './webgpu.ts'

// WebGPU 示例页面刻意保持极简：纯白底色 + 一块 canvas，没有文字、边框和
// 其他底色。GitHub Actions 的无头 Linux 环境对 WebGPU 画布内容的截图不稳定，
// 去掉多余元素后页面只剩单一合成层，便于定位 CI 截图问题。
const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <canvas id="triangle" width="400" height="300"></canvas>
`

const canvas = document.querySelector<HTMLCanvasElement>('#triangle')!

// 页面上不显示任何文字，渲染结果通过 data 属性暴露给测试：
// data-rendered="true" 表示渲染链路全部成功，data-rendered="error" 表示失败，
// 失败原因放在 data-error 里便于排查。
renderTriangle(canvas)
  .then(() => {
    canvas.dataset.rendered = 'true'
  })
  .catch((error: unknown) => {
    canvas.dataset.rendered = 'error'
    canvas.dataset.error = error instanceof Error ? error.message : String(error)
  })
