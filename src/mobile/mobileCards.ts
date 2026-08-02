// src/mobile/mobileCards.ts
//
// 把 tldraw snapshot 裡的卡片轉成手機看得懂的顯示模型（S2 唯讀瀏覽）。
//
// ── 為什麼手機不必跑 tldraw ─────────────────────────────────────────────────
// 卡片是 snapshot store 裡的 `card` shape，而讀它只需要純 JSON 操作——
// `getCardShapes` 是純函式，不碰 canvas、不碰編輯器。這是當初 S0(a) 把
// 「卡片擷取」抽成純函式時就鋪好的路，也是手機端能不打包 tldraw（419 kB → 不含）
// 的原因。
//
// ── 這一層只負責「怎麼顯示」，不負責「怎麼改」 ─────────────────────────────
// 全部是純函式，S3（手機編輯）要動的是反方向的 patch，不要把寫入邏輯混進來。
//
// ⚠️ 唯一的環境相依：`stripHtml` 內部用 DOMParser，所以這個模組**只能在頁面用，
// 不能進 service worker**（SW 沒有 DOMParser）。速記的送出路徑刻意不碰這裡，
// 就是為了讓 sw.ts 維持自足。測試檔因此要標 `@vitest-environment jsdom`。
import { getCardShapes } from '../utils/snapshot'
import { stripHtml, splitTitleBody } from '../utils/stringUtils'
import type { TLEditorSnapshot } from 'tldraw'

export type MobileCardType =
    | 'text' | 'todo' | 'link' | 'journal' | 'heading'
    | 'sticky' | 'table' | 'color' | 'file' | 'image' | 'board' | 'unknown'

export interface MobileTodo {
    /**
     * ⚠️ 勾選一定要用 id 定位，不是陣列索引。索引會隨著另一端新增/刪除項目而位移，
     * 拿索引去勾等於「勾到當時排在第 N 個的那一項」——兩端一起動時會勾錯人。
     */
    id: string
    text: string
    checked: boolean
    dueDate: string | null
}

export interface MobileCard {
    id: string
    type: MobileCardType
    /** 列表上那一行粗體字；沒有可辨識的標題時為空字串 */
    title: string
    /** 標題底下的內容預覽（已去掉 HTML） */
    body: string
    todos: MobileTodo[]
    /** link 卡的網址；其餘型別為 null */
    url: string | null
    /** file／image 卡的原始檔名——**手機打不開它們**，只能顯示名字 */
    fileName: string | null
    tags: string[]
    /** 排序用：卡片在畫布上的位置（由上而下、由左而右） */
    x: number
    y: number
}

const KNOWN_TYPES = new Set<MobileCardType>([
    'text', 'todo', 'link', 'journal', 'heading',
    'sticky', 'table', 'color', 'file', 'image', 'board',
])

/**
 * 從卡片內容取出標題與內文。
 *
 * ⚠️ **一定要在剝掉 HTML 之前分**。`stripHtml` 會把區塊元素之間壓成一個空格，
 * 所以 `<h2>標題</h2><p>內文</p>` 剝完是「標題 內文」一整行——那時候再怎麼切
 * 都分不出標題。（第一版就是寫成「剝完取第一行」，測試當場抓到。）
 *
 * 有 H1/H2 就用桌機那套 `splitTitleBody`（單一真相來源）；沒有標題標籤的卡
 * ——速記卡就是純文字——才退成「第一行當標題」。
 */
export function splitCardText(html: string): { title: string; body: string } {
    const viaHeading = splitTitleBody(html)
    if (viaHeading.title) return { title: viaHeading.title, body: viaHeading.body }

    // ⚠️ 同樣的理由要再小心一次：`stripHtml` 連純文字裡的換行也會壓成空格，
    // 所以要**先按換行切、再逐行剝**，不能剝完才切。
    const lines = html.split('\n').map(l => stripHtml(l).trim()).filter(Boolean)
    if (lines.length === 0) return { title: '', body: '' }
    return { title: lines[0], body: lines.slice(1).join(' ') }
}

/** 把一張 snapshot card shape 轉成顯示模型 */
export function toMobileCard(shape: {
    id: string
    x: number
    y: number
    props: Record<string, unknown>
}): MobileCard {
    const p = shape.props
    const rawType = typeof p.type === 'string' ? p.type : 'unknown'
    const type: MobileCardType = KNOWN_TYPES.has(rawType as MobileCardType)
        ? rawType as MobileCardType
        : 'unknown'

    const { title, body } = splitCardText(typeof p.text === 'string' ? p.text : '')

    const todos: MobileTodo[] = Array.isArray(p.todos)
        ? (p.todos as { id?: string; text?: string; checked?: boolean; dueDate?: string | null }[])
            .map(t => ({
                id: typeof t.id === 'string' ? t.id : '',
                text: stripHtml(t.text ?? ''),
                checked: !!t.checked,
                dueDate: t.dueDate ?? null,
            }))
            // 沒有 id 的項目（很舊的資料）不給勾——沒有 id 就無法安全定位
            .filter(t => t.text.length > 0 && t.id.length > 0)
        : []

    // 各型別的「標題」來源不一樣，硬套第一行會讓連結卡與檔案卡整列空白
    let finalTitle = title
    if (type === 'link' && !finalTitle) finalTitle = typeof p.title === 'string' ? p.title : (typeof p.url === 'string' ? p.url : '')
    if ((type === 'file' || type === 'image') && !finalTitle) {
        finalTitle = typeof p.originalName === 'string' ? p.originalName : ''
    }

    return {
        id: shape.id,
        type,
        title: finalTitle,
        body,
        todos,
        url: typeof p.url === 'string' ? p.url : null,
        fileName: typeof p.originalName === 'string' ? p.originalName : null,
        tags: Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
        x: shape.x,
        y: shape.y,
    }
}

/**
 * 一塊板的所有卡片，**照畫布位置排序**（先上下、再左右）。
 *
 * snapshot store 是物件，鍵順序不保證與視覺順序一致——不排的話，手機上的
 * 卡片順序會跟桌機看到的排版完全對不起來，同一塊板在兩邊像兩塊板。
 * 容差 40px：同一「列」的卡片高度常有些微差異，不容差的話會被拆成好幾列。
 */
export function readBoardCards(snapshot: TLEditorSnapshot | null): MobileCard[] {
    return getCardShapes(snapshot)
        .map(s => toMobileCard(s as unknown as { id: string; x: number; y: number; props: Record<string, unknown> }))
        .sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x))
}

/** 一塊板的摘要，用在清單那一列（不必展開就知道裡面有什麼） */
export function summarizeCards(cards: MobileCard[]): string {
    if (cards.length === 0) return '空白板'
    const openTodos = cards.reduce((n, c) => n + c.todos.filter(t => !t.checked).length, 0)
    const parts = [`${cards.length} 張卡`]
    if (openTodos > 0) parts.push(`${openTodos} 項未完成`)
    return parts.join(' · ')
}
