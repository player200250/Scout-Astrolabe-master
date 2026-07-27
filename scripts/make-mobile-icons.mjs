// scripts/make-mobile-icons.mjs
// 產生手機 PWA 的桌面圖示（192 / 512 PNG）。
//
// 為什麼自己刻 PNG：專案沒有影像處理依賴，而 manifest 的圖示用 SVG 在 Android
// 各版本支援度不一致（會變成沒有圖示的白框）。PNG 是唯一到處都認的格式，
// 而用 Node 內建的 zlib 手寫一張純色 + 圓點的 PNG 只要幾十行，不值得為此裝套件。
//
// 用法：node scripts/make-mobile-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'icons')

// 品牌色（與 mobile.css 的 --accent 同系）
const BG = [37, 99, 235]      // #2563eb
const FG = [255, 255, 255]

function crc32(buf) {
    let c, crc = 0xffffffff
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        crc = c ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(typeAndData))
    return Buffer.concat([len, typeAndData, crc])
}

/** 畫一張 size×size 的圖示：圓角藍底 ＋ 中央白色圓環（象徵星盤） */
function renderIcon(size) {
    const rows = []
    const c = (size - 1) / 2
    const radius = size * 0.22          // 圓角半徑
    const ringOuter = size * 0.30
    const ringInner = size * 0.19
    const dotR = size * 0.075

    for (let y = 0; y < size; y++) {
        // 每列開頭一個 filter byte（0 = None）
        const row = Buffer.alloc(1 + size * 4)
        for (let x = 0; x < size; x++) {
            const i = 1 + x * 4

            // 圓角矩形遮罩：只有四個角落要判斷距離
            const dxCorner = Math.max(radius - x, x - (size - 1 - radius), 0)
            const dyCorner = Math.max(radius - y, y - (size - 1 - radius), 0)
            const inside = Math.hypot(dxCorner, dyCorner) <= radius

            if (!inside) { row[i + 3] = 0; continue }   // 透明

            const d = Math.hypot(x - c, y - c)
            const onRing = d <= ringOuter && d >= ringInner
            const onDot = Math.hypot(x - c, y - (c - ringOuter * 0.98)) <= dotR
            const color = onRing || onDot ? FG : BG

            row[i] = color[0]; row[i + 1] = color[1]; row[i + 2] = color[2]; row[i + 3] = 255
        }
        rows.push(row)
    }

    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0)
    ihdr.writeUInt32BE(size, 4)
    ihdr[8] = 8      // bit depth
    ihdr[9] = 6      // colour type: RGBA
    // 10..12 = compression / filter / interlace，全 0

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [192, 512]) {
    const file = join(OUT_DIR, `icon-${size}.png`)
    writeFileSync(file, renderIcon(size))
    console.log(`✓ ${file}`)
}
