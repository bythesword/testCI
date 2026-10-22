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

export async function renderTriangle(canvas: HTMLCanvasElement): Promise<RenderTriangleHandles> {
  if (!navigator.gpu) {
    throw new Error('当前浏览器不支持 WebGPU')
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error('没有可用的 WebGPU adapter')
  }

  const device = await adapter.requestDevice()
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

export interface CanvasPixelStats {
  colored: number
  white: number
}

// 把离屏纹理拷回内存并统计非白像素。无头 Linux 的截图抓不到 WebGPU 画布
// 内容（合成器不会把它画进截图），但离屏纹理读回不经过画布和合成器，可以
// 真正确认三角形有没有被画出来。SwiftShader 上 mapAsync 可能一直不
// resolve，因此带超时保护，超时返回 'timeout'。
export async function readBackTexturePixelStats(
  device: GPUDevice,
  texture: GPUTexture,
  timeoutMs: number,
): Promise<CanvasPixelStats | 'timeout'> {
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
  if (timedOut) {
    buffer.destroy()
    return 'timeout'
  }

  const data = new Uint8Array(buffer.getMappedRange())
  let colored = 0
  let white = 0
  for (let y = 0; y < texture.height; y++) {
    const rowOffset = y * bytesPerRow
    for (let x = 0; x < texture.width; x++) {
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
  buffer.unmap()
  buffer.destroy()
  return { colored, white }
}
