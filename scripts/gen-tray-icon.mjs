// 產生托盤圖示 PNG（32x32 RGBA）：金色圓環 + 中心點，象徵星盤刻度環。
// 金色 (#f0b429) 在淺色與深色工作列上都看得見。
import zlib from 'zlib'
import fs from 'fs'

const S = 32
const px = Buffer.alloc(S * S * 4, 0) // RGBA, 透明底

const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return
    const i = (y * S + x) * 4
    // 以 alpha 疊加到既有像素上（抗鋸齒用）
    const sa = a / 255
    const da = px[i + 3] / 255
    const oa = sa + da * (1 - sa)
    if (oa === 0) return
    px[i]     = Math.round((r * sa + px[i]     * da * (1 - sa)) / oa)
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa)
    px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa)
    px[i + 3] = Math.round(oa * 255)
}

const GOLD = [240, 180, 41]
const cx = 15.5, cy = 15.5

// 以「到圓心距離與目標半徑的差」做 1px 羽化，避免 32px 下鋸齒難看
const ring = (radius, width) => {
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const d = Math.hypot(x - cx, y - cy)
            const edge = Math.abs(d - radius)
            const a = Math.max(0, Math.min(1, (width / 2 + 0.5 - edge)))
            if (a > 0) set(x, y, ...GOLD, Math.round(a * 255))
        }
    }
}

const disc = (radius) => {
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const d = Math.hypot(x - cx, y - cy)
            const a = Math.max(0, Math.min(1, radius + 0.5 - d))
            if (a > 0) set(x, y, ...GOLD, Math.round(a * 255))
        }
    }
}

ring(13, 2.4)   // 外環
ring(7.5, 1.6)  // 內環
disc(2.4)       // 中心點

// 四個方位刻度（上下左右），讓輪廓不只是同心圓
for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    for (let t = 9.5; t <= 11.5; t += 0.25) {
        set(Math.round(cx + dx * t), Math.round(cy + dy * t), ...GOLD, 255)
    }
}

// ── PNG 封裝 ──
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0 // filter type 0 (None)
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
}

const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8   // bit depth
ihdr[9] = 6   // color type: RGBA
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
])

fs.mkdirSync(process.argv[2].replace(/[^/\\]+$/, ''), { recursive: true })
fs.writeFileSync(process.argv[2], png)
console.log('wrote', process.argv[2], png.length, 'bytes')
