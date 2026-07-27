// vite.config.mobile.ts — 手機速記 PWA 的建置設定（S1）
//
// 與桌機版同一個 repo、同一份 src，只是換一個進入點：
//   桌機 index.html      → src/main.tsx        （Electron，載入 tldraw 全套）
//   手機 mobile/index.html → src/mobile/main.tsx（只有 React + supabase-js + 幾個 utils）
//
// 分成兩個 config 而不是用一份多 input，是因為兩者的 base / outDir / 產物用途完全不同，
// 混在一起只會讓桌機的 electron-builder 打包誤收手機的檔案。
//
// 建置：npm run build:mobile → dist-mobile/（純靜態，丟到任何 HTTPS 主機都能跑）
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
    root: 'mobile',
    // 相對路徑：不預設部署在網域根目錄，放在 /astrolabe/ 之類的子路徑也能用
    base: './',
    plugins: [react()],
    build: {
        outDir: '../dist-mobile',
        emptyOutDir: true,
        // 手機網路慢，產物越小越好；這個 App 本來就沒什麼東西
        target: 'es2020',
    },
    server: {
        // 用手機連桌機的 dev server 實測時要對外開放
        host: true,
        port: 5174,
    },
})
