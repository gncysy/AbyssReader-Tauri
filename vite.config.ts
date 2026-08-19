import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './engine'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },
  build: {
    rollupOptions: {
      external: (id) => {
        if (process.env.NODE_ENV === 'production') {
          if (id.includes('engine/sandbox/')) {
            return true
          }
        }
        return false
      },
    },
  },
  // ─── Vitest 测试配置 ───
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/src-tauri/**'],
    coverage: {
      provider: 'v8',
      include: ['engine/**/*.ts', 'src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts', '**/types/**'],
    },
  },
})
