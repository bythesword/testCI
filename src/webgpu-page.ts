import './style.css'
import { renderTriangle } from './webgpu.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="card webgpu-card">
    <h1>WebGPU 彩色三角形</h1>
    <canvas id="triangle" width="400" height="300"></canvas>
    <p id="webgpu-status">正在初始化 WebGPU…</p>
    <a class="back-link" href="/">返回首页</a>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#triangle')!
const status = document.querySelector<HTMLParagraphElement>('#webgpu-status')!

renderTriangle(canvas)
  .then(() => {
    status.textContent = 'WebGPU 渲染完成'
  })
  .catch((error: unknown) => {
    status.textContent = `WebGPU 初始化失败：${error instanceof Error ? error.message : String(error)}`
  })
