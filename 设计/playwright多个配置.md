playwright.config.ts` 里不是“只能填一个文件”，而是用目录 + 多个 glob 模式来声明范围：

- `testDir` 只接受一个根目录。
- `testMatch` 接受数组，可以同时列出多组匹配模式，所有命中文件都会纳入测试。
- 相对 glob 是基于 `testDir` 解析的。

例如把现有目录结构扩展成两个来源：

```
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'e2e/**/*.spec.ts',
    'visual/**/*.visual.ts',
  ],
})
```

这样 `tests/e2e/` 下的 `*.spec.ts` 和 `tests/visual/` 下的 `*.visual.ts` 都会被 Playwright 收集。还有 `testIgnore` 数组可以反向排除，比如 `testIgnore: ['**/__snapshots__/**', '**/helpers/**']`。

如果你想让不同的文件集合拥有完全独立的浏览器、视口或 `webServer` 配置，就用 `projects`，每个 project 可以有自己的 `testDir`/`testMatch`/`use`，例如：

```
projects: [
  { name: 'e2e', testDir: './tests/e2e' },
  { name: 'visual', testDir: './tests/visual', use: { viewport: { width: 1280, height: 720 } } },
]
```

所以“几个”没有硬性上限，本质是 `testMatch` 数组里的模式数量和 `projects` 数组里的配置数量。
