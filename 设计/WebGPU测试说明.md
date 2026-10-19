# WebGPU 测试说明

本文档记录 WebGPU 彩色三角形示例相关的测试新增内容与变更，并说明 Vitest 单元测试和
Playwright 端到端测试各自负责的范围。

## 测试相关的新增与变更

| 文件                            | 作用                                                                           | 类型 |
| ------------------------------- | ------------------------------------------------------------------------------ | ---- |
| `src/webgpu.ts`                 | 抽出顶点数据、顶点布局、WGSL shader 和管线创建逻辑，便于在 Node 环境做静态测试 | 新增 |
| `src/webgpu.test.ts`            | WebGPU 纯逻辑的 Vitest 单元测试                                                | 新增 |
| `src/webgpu-page.ts`            | 页面挂载：创建 canvas、调用渲染、把状态写进 `#webgpu-status`                   | 新增 |
| `webgpu.html`                   | WebGPU 示例页面入口                                                            | 新增 |
| `tests/e2e/webgpu.spec.ts`      | 在真实浏览器里跑 WebGPU，并等待渲染成功状态的 Playwright 测试                  | 新增 |
| `playwright.config.ts`          | 增加 `channel: 'chromium'` 和 WebGPU/SwiftShader 启动参数                      | 变更 |
| `package.json`、`tsconfig.json` | 增加 `@webgpu/types` 依赖并引入类型                                            | 变更 |
| `vite.config.ts`                | 增加 `webgpu.html` 作为多页面构建入口                                          | 变更 |

## Vitest 单元测试负责哪些

`src/webgpu.test.ts` 在 Node 环境运行，不启动浏览器，也不申请真实 GPU。它只验证
`src/webgpu.ts` 里可以静态检查的纯数据和纯文本内容。

它覆盖三个部分：

1. 顶点数据：确认有 3 个顶点，每个顶点按 `(x, y, r, g, b)` 交错存放，总长度为
   `3 × 5 = 15` 个 float；颜色分量都在 `[0, 1]` 范围内；三个顶点颜色互不相同。
2. 顶点缓冲区布局：确认 stride 为 20 字节，并包含位置 `float32x2` 和颜色
   `float32x3` 两个 attribute。
3. WGSL shader：静态确认存在 `@vertex`、`@fragment` 和 `@builtin(position)` 等关键
   标记，不执行真实编译。

这一层测试快、稳定、不依赖浏览器，用于尽早发现数据结构和 shader 文本写错的问题。

## Playwright 端到端测试负责哪些

`tests/e2e/webgpu.spec.ts` 负责验证 WebGPU 在真实浏览器环境里真正跑起来：

1. 通过 `webServer` 启动 Vite 开发服务器。
2. 打开 `http://127.0.0.1:5173/webgpu.html`。
3. 等待页面状态变为“WebGPU 渲染完成”，确认 adapter、device、管线创建和提交都成功。
4. 等待状态变为“WebGPU 渲染完成”。状态只有在 adapter、device、管线创建和 GPU queue
   提交全部成功后才更新，因此能证明 WebGPU 渲染链路是通的。

为了让 WebGPU 在无头环境可用，`playwright.config.ts` 使用新的 Chromium 无头模式，并
加上 `--enable-unsafe-webgpu`、`--use-webgpu-adapter=swiftshader` 和
`--enable-unsafe-swiftshader`。SwiftShader 是软件渲染器，保证 CI 上没有独立 GPU 也能
稳定完成渲染。由于 Linux 无头 Chromium 对 WebGPU 画布内容的截图不可靠，端到端测试
不做截图或像素断言，而是等待页面渲染成功状态。

## 两层测试的分工

| 关注点              | Vitest 单测            | Playwright 端到端测试  |
| ------------------- | ---------------------- | ---------------------- |
| 运行环境            | Node，无浏览器、无 GPU | Chromium + SwiftShader |
| 顶点数据、颜色范围  | 负责                   | 不直接断言             |
| 顶点布局、stride    | 负责                   | 不直接断言             |
| shader 关键标记     | 负责静态字符串检查     | 负责实际编译和运行     |
| adapter/device 申请 | 不负责                 | 负责                   |
| 画布最终渲染结果    | 不负责                 | 负责等待渲染成功状态   |
| 错误状态展示        | 不负责                 | 负责等待成功状态       |

简单说：单元测试回答“数据结构和 shader 文本对不对”，端到端测试回答“在真实浏览器里
三角形有没有成功画出来”。

## 常用命令

```bash
npm test
npm run test:e2e
npm run test:e2e:update
npm run ci
```

`npm test` 只跑单元测试，`npm run test:e2e` 只跑浏览器测试，
`npm run test:e2e:update` 在有意变更界面后更新快照，`npm run ci` 跑完整链路。
