# WebGPU 测试说明

本文档记录 WebGPU 彩色三角形示例相关的测试新增内容与变更，并说明 Vitest 单元测试和
Playwright 端到端测试各自负责的范围。

## 测试相关的新增与变更

| 文件                                                     | 作用                                                                                  | 类型 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| `src/webgpu.ts`                                          | 抽出顶点数据、顶点布局、WGSL shader、管线创建、离屏渲染、纹理读回与像素比对逻辑       | 新增 |
| `src/webgpu.test.ts`                                     | WebGPU 纯逻辑的 Vitest 单元测试                                                       | 新增 |
| `src/webgpu-page.ts`                                     | 页面挂载：创建 canvas、调用渲染，把渲染与基准图比对结果写进 canvas 的 data 属性       | 新增 |
| `src/webgpu-triangle-golden.png`                         | 离屏渲染的基准图（400×300，本地生成），本地 e2e 里读回像素与它逐像素比对              | 新增 |
| `scripts/generate-webgpu-golden.mjs`                     | 用同一套离屏渲染路径重新生成基准图（`npm run generate:webgpu-golden`）                | 新增 |
| `src/webgpu-style.css`                                   | WebGPU 示例专用样式：纯白底色、无边框，页面只有画布内容                               | 新增 |
| `webgpu.html`                                            | WebGPU 示例页面入口                                                                   | 新增 |
| `tests/e2e/webgpu.spec.ts`                               | 在真实浏览器里跑 WebGPU，验证像素与基准图一致；全部用例只在本地跑（远端 CI 不跑 e2e） | 新增 |
| `tests/e2e/__snapshots__/webgpu.spec.ts-snapshots/*.png` | WebGPU 页面视觉基线（本地生成，Windows 与 Linux 共用）                                | 新增 |
| `playwright.config.ts`                                   | 增加 `channel: 'chromium'` 和 WebGPU/SwiftShader 启动参数                             | 变更 |
| `package.json`、`tsconfig.json`                          | 增加 `@webgpu/types` 依赖并引入类型；增加基准图生成脚本                               | 变更 |
| `vite.config.ts`                                         | 增加 `webgpu.html` 作为多页面构建入口                                                 | 变更 |

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
   `data-rendered="error"`，原因放在 `data-error` 里）。画布渲染发生在读回验证
   之后（原因见下文调用顺序说明）。
4. 基准图像素比对断言：等待 `data-pixel-check="ok"`。页面把三角形画进一块离屏
   纹理，读回像素后与仓库里的基准图（`src/webgpu-triangle-golden.png`，由
   `scripts/generate-webgpu-golden.mjs` 用同一套渲染路径在本地生成）**逐像素比对**：
   任一通道差值超过 0.3×255 即视为差异像素，差异像素占比不超过 5% 才算通过
   （容差与 Playwright 截图一致，用于吸收跨平台 SwiftShader 的微小光栅化差异）。
   这一步在画布渲染**之前**执行（无头 Linux 上画布渲染会销毁设备，见下文）；
   读回不经过合成器也不依赖画布，超时标记为 `timeout`、只有白底标记为
   `no-colored-pixels`、与基准图差异过大标记为 `diff`、读回报错标记为 `error`
   （原因在 `data-pixel-error`），统计详情（含 `diffRatio`）放在 `data-pixel-stats`。
   页面还会跑几个读回探针（`data-probe-buffer1`、`data-probe-compute`、
   `data-probe-buffer2`），失败时日志里能看到各层结果便于定位；设备丢失时
   `data-device-lost` 记录原因。
5. 视觉快照断言：用 `toHaveScreenshot('webgpu-triangle.png')` 对整页做视觉快照，
   确认画布上真的出现了彩色三角形。整个 e2e 测试只在本地执行（原因见下文）。

示例页面刻意简化成“纯白背景 + 一块 canvas”：去掉了标题、状态文字、返回链接和
卡片边框，也去掉了深浅不一的底色，页面只剩单一合成层。这样截图里只有 WebGPU
渲染的画布内容，不受系统字体渲染、边框和多重底色的干扰。

本地用无头 Chromium，配合 `--enable-unsafe-webgpu`、`--use-webgpu-adapter=swiftshader`
和 `--enable-unsafe-swiftshader`。SwiftShader 是软件渲染器，保证没有独立 GPU 的
机器也能稳定完成渲染与读回。注意：同一 Chromium 版本下它的光栅化输出在 Windows
与 Linux 上**并不一致**（基准图逐像素比对有约 15% 像素超差，见下文），这是 e2e
只能在本地跑的另一个原因。

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
reference no longer exists."）；它也解释了历史上 `onSubmittedWorkDone` 回调
不返回的现象。

又试了让 CI 跑有头模式：工作流安装 Xvfb，用 `xvfb-run -a npm run test:e2e` 在
虚拟显示器上跑 Chromium。结果更糟：有头模式下 `requestAdapter()` 直接返回 null
（`data-rendered="error"`、`data-error="没有可用的 WebGPU adapter"`），渲染根本
跑不起来，截图也随之失败。

回到无头模式后改为“离屏纹理读回”：把三角形画进离屏纹理
（`RENDER_ATTACHMENT | COPY_SRC`）再读回，完全避开画布的共享图路径。结果 CI 上
仍是同一个错误，说明问题不在画布路径本身。于是在页面上加了一串读回探针（纯
缓冲区往返、compute shader 执行、离屏纹理读回），发现**所有** `mapAsync` 都报
同一个错误，且 `device.lost` 的 reason 是 `destroyed`——设备被销毁了。结合社区
报告（无头 SwiftShader 缺少 WebGPU 画布的 backing factory），定位到真正的元凶：
**无头 Linux 上，把 WebGPU 内容渲染到画布这一动作本身会销毁设备**，之后任何
GPU→CPU 读回都失败。

于是确定方案：把依赖读回的验证全部挪到画布渲染**之前**执行——先做纯缓冲区往返
探针、compute 执行探针，然后把三角形画进离屏纹理，读回像素与仓库里的基准图
（`src/webgpu-triangle-golden.png`）逐像素比对（`data-pixel-check`，容差与
Playwright 截图一致）；全部完成后再渲染到画布（`data-rendered`，供本地快照和
人工查看），画布渲染之后的缓冲区探针（`data-probe-buffer2`）还会顺带确认设备
是否被销毁。这套顺序解决了读回报错的问题，CI 上离屏渲染与读回开始正常工作。

为了让 CI 的验证等价于视觉快照，把“统计非白像素数”升级成了**基准图逐像素比对**：
用同一套离屏渲染路径在本地生成基准图（`scripts/generate-webgpu-golden.mjs`）
提交进仓库，CI 读回后逐像素比对（任一通道差值超过 0.3×255 计为差异像素，占比
不超过 5% 为通过）。然而第一次在 CI 上跑基准图比对就暴露了跨平台差异：三角形
结构完全正确（colored/white 像素数与基准图一模一样），但 `diffRatio=0.1568`、
`maxDiff=253`——15.7% 的像素超出容差，部分像素差近满量程（直方图
`buckets=90247/10939/12238/6576`）。而同一张基准图在本机比对的差异远小于 5%。
也就是说，同一 Chromium 版本、同一个 SwiftShader 软件渲染器，Windows 与 Linux
的光栅化输出在像素级别上并不一致（渐变插值存在结构性差异），无法用同一张
基准图跨平台做严格比对。

## 最终定论

经过以上排查，本项目的最终结论是：

- **远端 GitHub CI 只跑静态检查**（格式、类型检查 + 构建、Vitest 单元测试），
  **不跑 Playwright**。无头 Linux 对 WebGPU 的三重限制——画布渲染销毁设备、
  合成器截不到画布内容、跨平台 SwiftShader 像素差异——使远端无法对 WebGPU
  渲染做可靠验证。
- **Playwright 端到端测试只在本地运行**：`npm run test:e2e` 包含 GPU 读回 +
  基准图逐像素比对（`data-pixel-check="ok"`，验证渲染内容与预期一致）和视觉
  快照（`toHaveScreenshot`，验证画布真的显示出来）。本地与基准图的差异远小于
  5% 容差，两者互为补充，渲染验证的强度不变。
- **强制要求：push 前必须在本机执行 `npm run ci` 并全绿**（lint + format +
  typecheck + 单元测试 + e2e）。远端 CI 兜底静态部分，渲染验证只能由本地兜底。

代码里保留的调用顺序（读回验证先于画布渲染、画布渲染后的探针）以及页面上的
读回探针（`data-probe-buffer1/2`、`data-probe-compute`）继续保留：它们让本地
e2e 失败时能从 `data-*` 属性一眼看出失效层级，也为将来在 Linux/容器环境复跑
e2e 保留了诊断能力。像素比对超差时页面还会把实际读回与基准图并排画成 2D 画布
（`#pixel-diff`），配合 `screenshot: 'only-on-failure'`，失败截图里能直接看到
差异。

## 两层测试的分工

| 关注点              | Vitest 单测            | Playwright 端到端测试                             |
| ------------------- | ---------------------- | ------------------------------------------------- |
| 运行环境            | Node，无浏览器、无 GPU | Chromium + SwiftShader                            |
| 顶点数据、颜色范围  | 负责                   | 不直接断言                                        |
| 顶点布局、stride    | 负责                   | 不直接断言                                        |
| shader 关键标记     | 负责静态字符串检查     | 负责实际编译和运行                                |
| adapter/device 申请 | 不负责                 | 负责                                              |
| 画布最终渲染结果    | 不负责                 | 负责（离屏渲染与基准图逐像素比对 + 本地视觉快照） |
| 错误状态展示        | 不负责                 | 负责（`data-rendered="error"` 标记）              |

简单说：单元测试回答“数据结构和 shader 文本对不对”，端到端测试回答“在真实浏览器里
三角形有没有成功画出来”。

## 常用命令

```bash
npm test
npm run test:e2e
npm run test:e2e:update
npm run generate:webgpu-golden
npm run ci
```

`npm test` 只跑单元测试，`npm run test:e2e` 只跑浏览器测试，
`npm run test:e2e:update` 在有意变更界面后更新快照，`npm run ci` 跑完整链路——
**push 前必须运行并通过**。三角形或渲染参数变更后，用
`npm run generate:webgpu-golden` 重新生成基准图并一并提交。
