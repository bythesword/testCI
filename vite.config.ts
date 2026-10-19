import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        counter: 'counter.html',
        webgpu: 'webgpu.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
