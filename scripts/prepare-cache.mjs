/**
 * scripts/prepare-cache.mjs
 *
 * 在 Windows 上，electron-builder 解壓 winCodeSign 時會嘗試建立
 * macOS dylib 的 symbolic link，沒有開發者模式就會失敗並中止打包。
 *
 * 此腳本在打包前先把 winCodeSign 解壓到 electron-builder 的 cache 目錄，
 * 允許 7-Zip exit code 2（僅 macOS symlink 失敗，Windows 工具皆正常解壓），
 * 讓 electron-builder 找到既有 cache 直接略過自身的下載與解壓流程。
 */

import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import https from 'https'
import http from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const VERSION    = 'winCodeSign-2.6.0'
const LOCALAPPDATA = process.env.LOCALAPPDATA
if (!LOCALAPPDATA) {
  console.log('非 Windows 環境，略過。')
  process.exit(0)
}

const CACHE_BASE   = join(LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign')
const CACHE_DIR    = join(CACHE_BASE, VERSION)
const TEMP_ARCHIVE = join(CACHE_BASE, `${VERSION}.7z`)
const SEVENZIP     = join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

// cache 已存在 → 直接跳過
if (existsSync(CACHE_DIR)) {
  console.log(`winCodeSign cache 已存在：${CACHE_DIR}`)
  process.exit(0)
}

// ── 下載 ──────────────────────────────────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      const client = u.startsWith('https') ? https : http
      client.get(u, { headers: { 'User-Agent': 'node' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
        file.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

console.log(`正在下載 ${VERSION}...`)
mkdirSync(CACHE_BASE, { recursive: true })
mkdirSync(CACHE_DIR,  { recursive: true })

const url = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`
await download(url, TEMP_ARCHIVE)
console.log('下載完成，開始解壓...')

// ── 解壓 ──────────────────────────────────────────────────────────────────────
// exit code 2 = 僅有非致命錯誤（macOS symlink），Windows 工具已正確解壓，可接受
const result = spawnSync(
  SEVENZIP,
  ['x', '-y', '-bd', TEMP_ARCHIVE, `-o${CACHE_DIR}`],
  { stdio: 'inherit' }
)

try { unlinkSync(TEMP_ARCHIVE) } catch { /* 清理失敗不影響結果 */ }

if (result.status !== 0 && result.status !== 2) {
  console.error(`解壓失敗，exit code: ${result.status}`)
  process.exit(1)
}

console.log(`winCodeSign cache 準備完成：${CACHE_DIR}`)
