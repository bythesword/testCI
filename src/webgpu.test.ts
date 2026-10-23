import { describe, expect, it } from 'vitest'
import {
  TRIANGLE_FLOATS_PER_VERTEX,
  TRIANGLE_VERTEX_COUNT,
  TRIANGLE_VERTICES,
  alignedBytesPerRow,
  diffRatioVsRgbaReference,
  triangleShaderCode,
  triangleVertexBufferLayout,
} from './webgpu'

// 这个测试文件只验证 src/webgpu.ts 里可以被静态检查的纯数据部分，
// 不启动浏览器，也不申请真实的 GPU。真正的渲染结果由
// tests/e2e/webgpu.spec.ts 在浏览器里通过 Playwright 验证。
describe('WebGPU triangle vertex data', () => {
  // 顶点数组按 (x, y, r, g, b) 交错存放。先确认有三个顶点，
  // 且总长度等于“顶点数 × 每个顶点的 float 数”，避免少写或多写分量。
  it('defines exactly three vertices with interleaved position and color', () => {
    expect(TRIANGLE_VERTEX_COUNT).toBe(3)
    expect(TRIANGLE_VERTICES).toHaveLength(TRIANGLE_VERTEX_COUNT * TRIANGLE_FLOATS_PER_VERTEX)
  })

  // RGB 颜色分量必须在 [0, 1] 范围内，否则传给 shader 后会得到
  // 被截断或不合预期的颜色。这里遍历每个顶点的三个颜色通道逐一检查。
  it('keeps every vertex color inside the [0, 1] range', () => {
    for (let i = 0; i < TRIANGLE_VERTICES.length; i += TRIANGLE_FLOATS_PER_VERTEX) {
      const r = TRIANGLE_VERTICES[i + 2]
      const g = TRIANGLE_VERTICES[i + 3]
      const b = TRIANGLE_VERTICES[i + 4]

      for (const channel of [r, g, b]) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(1)
      }
    }
  })

  // 三个顶点的颜色必须互不相同，否则三角形会退化成单一颜色，
  // 无法看出“彩色三角形”的渐变效果。这里用 Set 去重后确认仍是 3 种颜色。
  it('uses a distinct primary color for each vertex', () => {
    const colors = [
      [TRIANGLE_VERTICES[2], TRIANGLE_VERTICES[3], TRIANGLE_VERTICES[4]],
      [TRIANGLE_VERTICES[7], TRIANGLE_VERTICES[8], TRIANGLE_VERTICES[9]],
      [TRIANGLE_VERTICES[12], TRIANGLE_VERTICES[13], TRIANGLE_VERTICES[14]],
    ]

    expect(new Set(colors.map((color) => color.join(',')))).toHaveLength(3)
  })
})

// 顶点缓冲区布局告诉 GPU 如何从一个连续的 Float32Array 里切出每个顶点：
// 5 个 float 一组，前面 2 个是位置，后面 3 个是颜色。
describe('WebGPU triangle vertex buffer layout', () => {
  // stride 是相邻两个顶点的字节间距：5 个 float × 4 字节 = 20。
  // 两个 attribute 分别对应 shader 里 location 0 的位置和 location 1 的颜色。
  it('describes a 5-float stride with position and color attributes', () => {
    expect(triangleVertexBufferLayout.arrayStride).toBe(
      TRIANGLE_FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
    )
    expect(triangleVertexBufferLayout.attributes).toHaveLength(2)
    expect(triangleVertexBufferLayout.attributes[0].format).toBe('float32x2')
    expect(triangleVertexBufferLayout.attributes[1].format).toBe('float32x3')
  })
})

// WGSL shader 的编译和运行需要真实 GPU，这里只做静态字符串检查，
// 确认关键入口标记存在，避免手滑改掉入口名或漏掉顶点着色器标记。
describe('WebGPU triangle shader', () => {
  // @vertex 是顶点着色器入口，@fragment 是片元着色器入口，
  // @builtin(position) 用于把顶点位置传给裁剪空间。
  it('declares the vertex and fragment entry points', () => {
    expect(triangleShaderCode).toContain('@vertex')
    expect(triangleShaderCode).toContain('@fragment')
    expect(triangleShaderCode).toContain('@builtin(position)')
  })
})

// 纹理读回时 copyTextureToBuffer 要求 bytesPerRow 是 256 的倍数，
// 这个换算函数是纯计算，可以在这里静态验证。
describe('WebGPU texture pixel readback layout', () => {
  it('aligns bytesPerRow up to a multiple of 256', () => {
    expect(alignedBytesPerRow(400)).toBe(1792)
    expect(alignedBytesPerRow(1)).toBe(256)
    expect(alignedBytesPerRow(256)).toBe(1024)
    expect(alignedBytesPerRow(65)).toBe(512)
  })
})

// 基准图像素比对是纯计算：读回是 BGRA 字节序、参考图是 RGBA，同样颜色
// 应该比出零差异；任一通道差值超过 threshold×255 的像素才计入差异。
describe('WebGPU pixel diff against reference', () => {
  // 2×2 的小图，读回按行对齐（alignedBytesPerRow(2)=256，行尾有填充）。
  function makePairs(color: { r: number; g: number; b: number }) {
    const actual = new Uint8Array(alignedBytesPerRow(2) * 2)
    const reference = new Uint8ClampedArray(2 * 2 * 4)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const offset = y * alignedBytesPerRow(2) + x * 4
        actual[offset] = color.b
        actual[offset + 1] = color.g
        actual[offset + 2] = color.r
        actual[offset + 3] = 255
        const referenceOffset = (y * 2 + x) * 4
        reference[referenceOffset] = color.r
        reference[referenceOffset + 1] = color.g
        reference[referenceOffset + 2] = color.b
        reference[referenceOffset + 3] = 255
      }
    }
    return { actual, reference }
  }

  it('reports zero diff when BGRA and RGBA describe the same colors', () => {
    const { actual, reference } = makePairs({ r: 10, g: 20, b: 30 })
    expect(diffRatioVsRgbaReference(actual, reference, 2, 2)).toEqual({
      diffPixels: 0,
      totalPixels: 4,
      diffRatio: 0,
    })
  })

  it('counts only pixels whose channel distance exceeds the threshold', () => {
    const { actual, reference } = makePairs({ r: 0, g: 0, b: 0 })
    // 阈值 0.3×255=76.5：差 76 不大于阈值，不计；差 77 大于阈值，计。
    actual[0] = Math.floor(0.3 * 255)
    actual[4] = Math.floor(0.3 * 255) + 1
    // 第三处差异在另一行第一个像素的绿色通道上（同一像素只计一次）。
    actual[alignedBytesPerRow(2) + 1] = Math.floor(0.3 * 255) + 1
    expect(diffRatioVsRgbaReference(actual, reference, 2, 2)).toEqual({
      diffPixels: 2,
      totalPixels: 4,
      diffRatio: 0.5,
    })
  })
})
