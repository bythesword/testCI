export const TRIANGLE_VERTEX_COUNT = 3
export const TRIANGLE_FLOATS_PER_VERTEX = 5

// 验证用离屏渲染的尺寸，与 webgpu.html 里 canvas 的 width/height 一致。
export const TRIANGLE_RENDER_WIDTH = 400
export const TRIANGLE_RENDER_HEIGHT = 300

// 每个顶点按 (x, y, r, g, b) 交错存储：2 个位置分量 + 3 个颜色分量。
export const TRIANGLE_VERTICES = new Float32Array([
  0.0, 0.8, 1.0, 0.0, 0.0, -0.8, -0.8, 0.0, 1.0, 0.0, 0.8, -0.8, 0.0, 0.0, 1.0,
])

export const triangleVertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: TRIANGLE_FLOATS_PER_VERTEX * 4,
  stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
    { shaderLocation: 1, offset: 2 * 4, format: 'float32x3' },
  ],
}

export const triangleShaderCode = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vertexMain(
  @location(0) position: vec2<f32>,
  @location(1) color: vec3<f32>,
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.color = vec4<f32>(color, 1.0);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`

export function createTrianglePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: triangleShaderCode })

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [triangleVertexBufferLayout],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  })
}

function createTriangleVertexBuffer(device: GPUDevice): GPUBuffer {
  const vertexBuffer = device.createBuffer({
    size: TRIANGLE_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  })
  new Float32Array(vertexBuffer.getMappedRange()).set(TRIANGLE_VERTICES)
  vertexBuffer.unmap()
  return vertexBuffer
}

function encodeTriangleDraw(
  encoder: GPUCommandEncoder,
  pipeline: GPURenderPipeline,
  vertexBuffer: GPUBuffer,
  colorAttachment: GPURenderPassColorAttachment,
): void {
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [colorAttachment],
  })
  renderPass.setPipeline(pipeline)
  renderPass.setVertexBuffer(0, vertexBuffer)
  renderPass.draw(TRIANGLE_VERTEX_COUNT)
  renderPass.end()
}

// 把三角形渲染进一块离屏纹理并返回。离屏纹理不走画布的外部共享图路径，
// 可以在无头 Linux 上安全地读回验证（画布纹理读回会报 Vulkan 实例错误）。
export function renderTriangleToTexture(
  device: GPUDevice,
  format: GPUTextureFormat,
  width: number,
  height: number,
): GPUTexture {
  const texture = device.createTexture({
    size: [width, height],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const pipeline = createTrianglePipeline(device, format)
  const vertexBuffer = createTriangleVertexBuffer(device)

  const encoder = device.createCommandEncoder()
  encodeTriangleDraw(encoder, pipeline, vertexBuffer, {
    view: texture.createView(),
    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  })
  device.queue.submit([encoder.finish()])
  return texture
}

export interface RenderTriangleHandles {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

// 申请 adapter 与 device，不涉及画布。页面先拿到 device 做离屏验证，
// 之后再渲染到画布——无头 Linux 上画布渲染会销毁设备（见 renderTriangleToCanvas）。
export async function requestWebGpuDevice(): Promise<GPUDevice> {
  if (!navigator.gpu) {
    throw new Error('当前浏览器不支持 WebGPU')
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error('没有可用的 WebGPU adapter')
  }

  return adapter.requestDevice()
}

// 把三角形渲染到指定 canvas 并返回画布纹理格式。无头 Linux 的合成器没有
// WebGPU 画布的 backing factory，画布渲染之后设备会被浏览器销毁，因此所有
// 依赖读回的验证必须先于画布渲染完成（见 webgpu-page.ts 的调用顺序）。
export function renderTriangleToCanvas(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
): GPUTextureFormat {
  const context = canvas.getContext('webgpu')
  if (!context) {
    throw new Error('无法获取 WebGPU 渲染上下文')
  }

  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'opaque' })

  const pipeline = createTrianglePipeline(device, format)
  const vertexBuffer = createTriangleVertexBuffer(device)

  const commandEncoder = device.createCommandEncoder()
  encodeTriangleDraw(commandEncoder, pipeline, vertexBuffer, {
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  })
  device.queue.submit([commandEncoder.finish()])
  return format
}

export async function renderTriangle(canvas: HTMLCanvasElement): Promise<RenderTriangleHandles> {
  const device = await requestWebGpuDevice()
  const format = renderTriangleToCanvas(device, canvas)
  const context = canvas.getContext('webgpu')!
  return { device, context, format }
}

// 纹理读回时的行字节数必须是 256 的倍数（WebGPU copyTextureToBuffer 的要求），
// 按每像素 4 字节对宽度向上取整。
export const PIXEL_READ_BYTES_PER_PIXEL = 4
const PIXEL_READ_BYTES_PER_ROW_ALIGNMENT = 256

export function alignedBytesPerRow(width: number): number {
  return (
    Math.ceil((width * PIXEL_READ_BYTES_PER_PIXEL) / PIXEL_READ_BYTES_PER_ROW_ALIGNMENT) *
    PIXEL_READ_BYTES_PER_ROW_ALIGNMENT
  )
}

// 带超时的 mapAsync：SwiftShader 上可能一直不 resolve，超时返回 'timeout'。
// mapAsync 本身 reject（如无头 Linux 的设备丢失错误）时原样抛出，由调用方记录。
export async function mapReadableBufferWithTimeout(
  buffer: GPUBuffer,
  timeoutMs: number,
): Promise<'ok' | 'timeout'> {
  let timedOut = false
  const mapPromise = buffer.mapAsync(GPUMapMode.READ)
  mapPromise.catch(() => {
    // 超时后 mapAsync 可能仍会 reject，这里吞掉避免 unhandled rejection。
  })
  await Promise.race([
    mapPromise,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        timedOut = true
        resolve()
      }, timeoutMs)
    }),
  ])
  return timedOut ? 'timeout' : 'ok'
}

export interface CanvasPixelStats {
  colored: number
  white: number
}

// 把离屏纹理拷回内存，返回按行对齐的原始字节（格式为 bgra8unorm 时字节序是
// B,G,R,A，每行末尾可能有对齐填充，行宽用 alignedBytesPerRow 计算）。无头
// Linux 的截图抓不到 WebGPU 画布内容（合成器不会把它画进截图），但离屏纹理
// 读回不经过画布和合成器，可以拿到真实渲染结果。SwiftShader 上 mapAsync
// 可能一直不 resolve，因此带超时保护，超时返回 'timeout'。
export async function readBackTexturePixels(
  device: GPUDevice,
  texture: GPUTexture,
  timeoutMs: number,
): Promise<Uint8Array | 'timeout'> {
  const bytesPerRow = alignedBytesPerRow(texture.width)
  const buffer = device.createBuffer({
    size: bytesPerRow * texture.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const encoder = device.createCommandEncoder()
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow, rowsPerImage: texture.height }, [
    texture.width,
    texture.height,
  ])
  device.queue.submit([encoder.finish()])

  const mapResult = await mapReadableBufferWithTimeout(buffer, timeoutMs)
  if (mapResult === 'timeout') {
    buffer.destroy()
    return 'timeout'
  }
  // getMappedRange 返回映射内存的 ArrayBuffer，直接 new Uint8Array 只是视图，
  // unmap 后内存失效会读到 undefined；slice 拷贝一份字节再释放缓冲区。
  const pixels = new Uint8Array(buffer.getMappedRange().slice(0))
  buffer.unmap()
  buffer.destroy()
  return pixels
}

// 统计读回数据里的非白像素与白像素（三个通道都 >240 视为白）。
export function countWhiteAndColoredPixels(data: Uint8Array, width: number): CanvasPixelStats {
  const bytesPerRow = alignedBytesPerRow(width)
  const height = data.length / bytesPerRow
  let colored = 0
  let white = 0
  for (let y = 0; y < height; y++) {
    const rowOffset = y * bytesPerRow
    for (let x = 0; x < width; x++) {
      const offset = rowOffset + x * PIXEL_READ_BYTES_PER_PIXEL
      const first = data[offset]
      const second = data[offset + 1]
      const third = data[offset + 2]
      if (first > 240 && second > 240 && third > 240) {
        white += 1
      } else {
        colored += 1
      }
    }
  }
  return { colored, white }
}

// 与 Playwright 截图容差保持一致的像素比对参数。
export const PIXEL_DIFF_THRESHOLD = 0.3
export const MAX_DIFF_PIXEL_RATIO = 0.05

export interface PixelDiffStats {
  diffPixels: number
  totalPixels: number
  diffRatio: number
}

// 把读回的 BGRA 字节与 RGBA 参考图逐像素比对：任一通道差值超过
// threshold × 255 即视为差异像素。CI 上用它与本地生成的基准图
// （scripts/generate-webgpu-golden.mjs）比对，确认离屏渲染结果与预期一致；
// 容差用于吸收跨平台 SwiftShader 的微小光栅化差异。
export function diffRatioVsRgbaReference(
  actualBgra: Uint8Array,
  referenceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = PIXEL_DIFF_THRESHOLD,
): PixelDiffStats {
  const bytesPerRow = alignedBytesPerRow(width)
  const limit = threshold * 255
  let diffPixels = 0
  for (let y = 0; y < height; y++) {
    const rowOffset = y * bytesPerRow
    const referenceRowOffset = y * width * PIXEL_READ_BYTES_PER_PIXEL
    for (let x = 0; x < width; x++) {
      const offset = rowOffset + x * PIXEL_READ_BYTES_PER_PIXEL
      const referenceOffset = referenceRowOffset + x * PIXEL_READ_BYTES_PER_PIXEL
      if (
        Math.abs(actualBgra[offset] - referenceRgba[referenceOffset + 2]) > limit ||
        Math.abs(actualBgra[offset + 1] - referenceRgba[referenceOffset + 1]) > limit ||
        Math.abs(actualBgra[offset + 2] - referenceRgba[referenceOffset]) > limit
      ) {
        diffPixels += 1
      }
    }
  }
  const totalPixels = width * height
  return { diffPixels, totalPixels, diffRatio: diffPixels / totalPixels }
}

// 诊断探针一：最基础的缓冲区往返——writeBuffer 写入已知值再 mapAsync 读回
// 核对。不涉及纹理、渲染管线和画布，用来判断无头 Linux CI 上 GPU→CPU 读回
// 本身是否可用。
export async function probeBufferRoundtrip(
  device: GPUDevice,
  timeoutMs: number,
): Promise<'ok' | 'wrong-value' | 'timeout'> {
  const buffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  device.queue.writeBuffer(buffer, 0, new Uint32Array([0x01020304]))

  const mapResult = await mapReadableBufferWithTimeout(buffer, timeoutMs)
  if (mapResult === 'timeout') {
    buffer.destroy()
    return 'timeout'
  }
  const value = new Uint32Array(buffer.getMappedRange())[0]
  buffer.unmap()
  buffer.destroy()
  return value === 0x01020304 ? 'ok' : 'wrong-value'
}

const computeProbeShaderCode = `
@group(0) @binding(0) var<storage, read_write> result: array<u32>;

@compute @workgroup_size(1)
fn main() {
  result[0] = 1u + 2u;
}
`

// 诊断探针二：compute shader 把 1+2 写进 storage buffer 再 mapAsync 读回核对。
// 这条链路验证 shader 编译、管线创建、GPU 实际执行和缓冲区读回，但不涉及
// 纹理与画布，用来和纹理读回对比，定位无头 Linux CI 上失效的层级。
export async function probeComputeExecution(
  device: GPUDevice,
  timeoutMs: number,
): Promise<'ok' | 'wrong-value' | 'timeout'> {
  const buffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.MAP_READ,
  })
  const module = device.createShaderModule({ code: computeProbeShaderCode })
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  })
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  })

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(1)
  pass.end()
  device.queue.submit([encoder.finish()])

  const mapResult = await mapReadableBufferWithTimeout(buffer, timeoutMs)
  if (mapResult === 'timeout') {
    buffer.destroy()
    return 'timeout'
  }
  const value = new Uint32Array(buffer.getMappedRange())[0]
  buffer.unmap()
  buffer.destroy()
  return value === 3 ? 'ok' : 'wrong-value'
}
