/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// App 要顯示自己的版本號，但 renderer 讀不到 package.json（打包後不在那裡），
// 所以在建置時把它編進 bundle。單一真相仍是 package.json。
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  build: {
    rollupOptions: {
      // Scout Desktop（第二個視窗）是第二個入口，輸出到同一個 dist/：
      // 同一個 origin ⇒ 主題的 localStorage 共用；共用模組自動拆成共用 chunk
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        desktop: fileURLToPath(new URL('./desktop.html', import.meta.url)),
      },
    },
  },
  test: {
    // 純函式測試：用 node 環境即可，不需要 jsdom
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      // `npm run test:coverage` 產出；不設 threshold（測試聚焦純函式/關鍵路徑，
      // 不追求數字目標，避免為覆蓋率硬測 UI 樣板）。
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
  plugins: [
    react(),
    {
      name: 'block-svg-url-requests',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? ''
          // %3Csvg / %3csvg = URL-encoded "<svg"
          // 舊縮圖格式（原始 SVG 字串）被當成 URL 傳入時，
          // 在此攔截並回傳 404，防止 Vite 的 decodeURIComponent
          // 對非法 percent-sequence 拋出 URIError: URI malformed 崩潰。
          if (url.includes('%3Csvg') || url.includes('%3csvg')) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
            return
          }
          next()
        })
      },
    },
  ],
})
