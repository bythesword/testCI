export const TRIANGLE_VERTEX_COUNT = 3
export const TRIANGLE_FLOATS_PER_VERTEX = 5

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

export async function renderTriangle(canvas: HTMLCanvasElement): Promise<void> {
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
  const vertexBuffer = device.createBuffer({
    size: TRIANGLE_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  })
  new Float32Array(vertexBuffer.getMappedRange()).set(TRIANGLE_VERTICES)
  vertexBuffer.unmap()

  const commandEncoder = device.createCommandEncoder()
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  renderPass.setPipeline(pipeline)
  renderPass.setVertexBuffer(0, vertexBuffer)
  renderPass.draw(TRIANGLE_VERTEX_COUNT)
  renderPass.end()

  device.queue.submit([commandEncoder.finish()])
  await device.queue.onSubmittedWorkDone()
}
