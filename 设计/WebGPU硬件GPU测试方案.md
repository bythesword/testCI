# WebGPU 硬件 GPU 测试方案（e2e-GPU 分支）

## 目标

在 `e2e-GPU` 分支上把硬件 GPU 设为 Playwright e2e 的默认渲染模式，让 WebGPU 用例直接跑
在本机真实显卡上，而不是 SwiftShader 软件模拟。SwiftShader 保留为可选回退，用于生成
软件基准图、无 GPU 环境排查，以及软件/硬件基准图的一致性对比。

## 最终结构

| 文件                                 | 作用                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `playwright.config.ts`               | 默认配置：有头 Chromium + 硬件 GPU，不带 SwiftShader 参数 |
| `tests/e2e/webgpu.spec.ts`           | 默认 WebGPU 用例：硬件 GPU 渲染、读回比对、视觉快照       |
| `tests/e2e/golden-diff.spec.ts`      | 比较软件/硬件两张基准图，断言差异率不超阈值               |
| `src/webgpu-page.ts`                 | 默认用硬件基准图，`?golden=sw` 回退 SwiftShader 基准图    |
| `scripts/generate-webgpu-golden.mjs` | 默认生成 SwiftShader 基准图，`--hardware` 生成硬件基准图  |

## 关键设计

### 默认配置改为硬件 GPU

`playwright.config.ts` 使用：

- `headless: false`：真实 GPU 需要窗口与合成器，无头模式通常拿不到硬件 adapter。
- `channel: 'chromium'`：避免默认 headless shell。
- 启动参数只保留 `--enable-unsafe-webgpu`，删掉两个 SwiftShader 参数。

这样 `npm run test:e2e` 默认就在硬件 GPU 上跑。

### 页面默认使用硬件基准图

`src/webgpu-page.ts` 按查询参数选择基准图：

- 默认（无查询参数）：`webgpu-triangle-golden-gpu.png`（硬件 GPU 生成）。
- `?golden=sw`：`webgpu-triangle-golden.png`（SwiftShader 生成）。

两张图都用 `new URL('./xxx.png', import.meta.url).href` 引用，保证都被 Vite 打包。

### WebGPU 用例断言真实 GPU

`tests/e2e/webgpu.spec.ts` 访问 `/webgpu.html`，断言：

- `data-probes-done="true"`：读回探针全部完成。
- `data-adapter` 非空且不含 `swiftshader`：确认真实硬件 adapter。
- `data-pixel-check="ok"`：离屏读回与硬件基准图逐像素比对通过。
- `data-rendered="true"`：画布渲染成功。
- 视觉快照 `webgpu-triangle.png`：确认三角形真的显示出来。

### 软件/硬件一致性检查

`tests/e2e/golden-diff.spec.ts` 在浏览器里解码两张基准图，按仓库同一套阈值逻辑
（单通道差 > 0.3×255 记差异像素，diffRatio > 0.05 判超差）比较，断言差异率不超上限。

### 基准图生成

- `npm run generate:webgpu-golden`：SwiftShader 生成 `src/webgpu-triangle-golden.png`。
- `npm run generate:webgpu-golden:gpu`：有头硬件 GPU 生成
  `src/webgpu-triangle-golden-gpu.png`。

## 验证命令

```bash
npm run test:e2e              # 默认硬件 GPU 跑全部 e2e
npm run test:e2e:update       # 有意变更后重生成视觉快照
npm run test:e2e:compare      # 只跑软件/硬件基准图一致性检查
npm run generate:webgpu-golden
npm run generate:webgpu-golden:gpu
npm run ci                    # push 前必须全绿
```

## 风险与注意点

- 像素不可复现：硬件 GPU 的光栅化结果随显卡与驱动变化，快照与硬件基准图只在本机或
  同型号 GPU 上有意义，不应进 CI。
- 有头模式依赖本机图形会话，远程无显示环境会启动失败，测试时会弹出真实浏览器窗口。
- 若 `data-adapter` 为空或 adapter 为 null，说明本机 Chromium 没拿到硬件 adapter：
  排查 GPU 驱动与 D3D12/Vulkan，必要时追加 `--enable-features=Vulkan`。
