// vite.config.sw.ts — 手機 PWA 的 service worker 建置（S1／背景同步）
//
// 為什麼要**單獨一個 config**：
//
// service worker 必須是 dist-mobile 根目錄下、檔名固定的 `sw.js`（scope 由所在路徑決定），
// 而且要能被 `register('./sw.js')` 以**傳統 script**（非 module）載入——module service worker
// 在各家瀏覽器的支援度不一致，iOS Safari 上若註冊失敗會連離線開啟都一起沒了。
//
// 因此這一輪把 sw.ts 打包成**自足的 IIFE**（所有 import 內聯進單一檔案、不產生 chunk）。
// 這樣它就能直接 import `appendQuickCaptureCard` 等共用邏輯，不必在 sw 裡複製一份
// ——複製正是「手機記的卡跟桌機長得不一樣」這類漂移的來源。
//
// 主 config（vite.config.mobile.ts）是 ES module 輸出、且會清空 outDir，所以兩者不能合併，
// 必須先跑主建置、再跑這一輪（emptyOutDir: false 才不會把 app 洗掉）。
import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        outDir: 'dist-mobile',
        emptyOutDir: false,     // ⚠️ 必須 false：主建置的產物已經在裡面了
        target: 'es2020',
        rollupOptions: {
            input: 'src/mobile/sw.ts',
            output: {
                format: 'iife',
                entryFileNames: 'sw.js',
                // 自足單檔：service worker 不方便去載入分割出來的 chunk
                inlineDynamicImports: true,
            },
        },
    },
})
