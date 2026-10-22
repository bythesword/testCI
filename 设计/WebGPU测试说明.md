# WebGPU 测试说明

本文档记录 WebGPU 彩色三角形示例相关的测试新增内容与变更，并说明 Vitest 单元测试和
Playwright 端到端测试各自负责的范围。

## 测试相关的新增与变更

| 文件                                                     | 作用                                                                          | 类型 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---- |
| `src/webgpu.ts`                                          | 抽出顶点数据、顶点布局、WGSL shader、管线创建、离屏渲染与纹理读回逻辑         | 新增 |
| `src/webgpu.test.ts`                                     | WebGPU 纯逻辑的 Vitest 单元测试                                               | 新增 |
| `src/webgpu-page.ts`                                     | 页面挂载：创建 canvas、调用渲染，把渲染与像素读回结果写进 canvas 的 data 属性 | 新增 |
| `src/webgpu-style.css`                                   | WebGPU 示例专用样式：纯白底色、无边框，页面只有画布内容                       | 新增 |
| `webgpu.html`                                            | WebGPU 示例页面入口                                                           | 新增 |
| `tests/e2e/webgpu.spec.ts`                               | 在真实浏览器里跑 WebGPU，用离屏纹理读回验证像素；视觉快照只在本地跑           | 新增 |
| `tests/e2e/__snapshots__/webgpu.spec.ts-snapshots/*.png` | WebGPU 页面视觉基线（本地生成，Windows 与 Linux 共用）                        | 新增 |
| `playwright.config.ts`                                   | 增加 `channel: 'chromium'` 和 WebGPU/SwiftShader 启动参数                     | 变更 |
| `package.json`、`tsconfig.json`                          | 增加 `@webgpu/types` 依赖并引入类型                                           | 变更 |
| `vite.config.ts`                                         | 增加 `webgpu.html` 作为多页面构建入口                                         | 变更 |

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

`tests/e2e/webgpu.spec.ts` 有两个用例：

1. 通过 `webServer` 启动 Vite 开发服务器。
2. 打开 `http://127.0.0.1:5173/webgpu.html`。
3. 等待 canvas 出现 `data-rendered="true"`，确认 adapter、device、管线创建和 GPU
   queue 提交全部成功（页面不显示文字，渲染结果通过 data 属性暴露；失败时标记为
   `data-rendered="error"`，原因放在 `data-error` 里）。
4. 离屏纹理读回断言：等待 `data-pixel-check="ok"`。页面渲染完成后会把三角形再画进
   一块离屏纹理并拷回内存统计非白像素——读回不经过合成器，也不走画布的外部共享图
   路径；超时标记为 `timeout`、只有白底标记为 `no-colored-pixels`、读回报错标记为
   `error`（原因在 `data-pixel-error`），统计详情放在 `data-pixel-stats`。
5. 视觉快照断言：用 `toHaveScreenshot('webgpu-triangle.png')` 对整页做视觉快照，
   确认画布上真的出现了彩色三角形。此用例只在本地执行，CI 上跳过（原因见下文）。

为了让 CI 截图可验证，示例页面刻意简化成“纯白背景 + 一块 canvas”：去掉了标题、
状态文字、返回链接和卡片边框，也去掉了深浅不一的底色，页面只剩单一合成层。这样
截图里只有 WebGPU 渲染的画布内容，不再受系统字体渲染、边框和多重底色的干扰。

本地和 CI 都用无头 Chromium，配合 `--enable-unsafe-webgpu`、
`--use-webgpu-adapter=swiftshader` 和 `--enable-unsafe-swiftshader`。SwiftShader
是软件渲染器，保证 CI 上没有独立 GPU 也能稳定完成渲染；同一 Chromium 版本下它的
光栅化输出在 Windows 与 Linux 上应当一致，因此视觉基线可以跨平台共用（视觉快照
目前只在本地执行，见下文）。

## CI 截图问题的定位过程与最终方案

第一次在 GitHub Actions 上执行视觉快照断言时，`data-rendered="true"` 正常出现
（渲染链路成功），但快照失败：37,364 个像素不同，下载 artifact 分析发现 Linux
截图中画布区域是全白——三角形完全没有进入截图，即使页面已简化成纯白背景也一样。
这说明问题不在文字、边框或底色，而是无头 Linux 的合成器不会把 WebGPU 画布内容
画进截图。

随后尝试给 Chromium 追加 `--run-all-compositor-stages-before-draw` 与
`--disable-frame-rate-limit` 两个启动开关，CI 结果与之前完全一致（仍是 37,364 个
像素差异），说明合成器开关也无效，问题出得更深。

接着尝试绕开合成器：页面渲染完成后把画布纹理通过 `copyTextureToBuffer` 拷回内存、
`mapAsync` 读回并统计非白像素。结果在无头 Linux 上 `mapAsync` 直接报错
（"Failed to execute 'mapAsync' on 'GPUBuffer': A valid external Instance
reference..."）。该错误来自画布纹理的外部共享图（SharedImage）路径，普通
缓冲区/离屏纹理的读回不受影响；它也解释了历史上 `onSubmittedWorkDone` 回调
不返回的现象。

又试了让 CI 跑有头模式：工作流安装 Xvfb，用 `xvfb-run -a npm run test:e2e` 在
虚拟显示器上跑 Chromium。结果更糟：有头模式下 `requestAdapter()` 直接返回 null
（`data-rendered="error"`、`data-error="没有可用的 WebGPU adapter"`），渲染根本
跑不起来，截图也随之失败。

最终方案是“离屏纹理读回”：渲染链路成功后，把三角形再画进一块离屏纹理
（`RENDER_ATTACHMENT | COPY_SRC`）并读回内存统计非白像素。离屏纹理不走画布的
外部共享图路径，`mapAsync` 可以正常完成；读回也不经过合成器，不受截图抓不到
画布内容的影响。因此 CI 保持无头模式（adapter 可用），视觉快照用例只在本地跑
（`test.skip(process.env.CI === 'true')`），CI 上的渲染验证由离屏读回断言负责。

## 两层测试的分工

| 关注点              | Vitest 单测            | Playwright 端到端测试                   |
| ------------------- | ---------------------- | --------------------------------------- |
| 运行环境            | Node，无浏览器、无 GPU | Chromium + SwiftShader                  |
| 顶点数据、颜色范围  | 负责                   | 不直接断言                              |
| 顶点布局、stride    | 负责                   | 不直接断言                              |
| shader 关键标记     | 负责静态字符串检查     | 负责实际编译和运行                      |
| adapter/device 申请 | 不负责                 | 负责                                    |
| 画布最终渲染结果    | 不负责                 | 负责（离屏纹理读回断言 + 本地视觉快照） |
| 错误状态展示        | 不负责                 | 负责（`data-rendered="error"` 标记）    |

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
