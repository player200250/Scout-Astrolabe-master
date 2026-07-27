// src/mobile/mobileCapture.ts
// 手機速記的資料層（S1）。
//
// 設計的第一原則：**打完字按送出，那段文字就不能再弄丟**。
// 人在外面、訊號時有時無，如果「送出」等於「打 API」，那沒訊號的時候就是打了白打。
// 所以流程一律是：
//
//     1. 先寫進本機 outbox（localStorage，同步、不會失敗）
//     2. 再試著把 outbox 沖到雲端；失敗就留著，下次開啟／恢復連線時自動重試
//
// 收件匣的 board id 兩端都是 constants.ts 的 INBOX_BOARD_ID，所以手機寫進去的卡
// 會直接出現在桌機的收件匣，不需要任何額外的對應關係。
import type { BoardRecord } from '../db'
import { INBOX_BOARD_ID } from '../constants'
import { pullBoard, pushBoard } from '../sync/boardSync'
import { appendQuickCaptureCard } from '../utils/quickCaptureCard'

const OUTBOX_KEY = 'astrolabe-mobile-outbox'

export interface OutboxNote {
    id: string
    text: string
    createdAt: number
}

// ── outbox（本機暫存）─────────────────────────────────────────────────────────

export function loadOutbox(): OutboxNote[] {
    try {
        const raw = localStorage.getItem(OUTBOX_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed as OutboxNote[] : []
    } catch {
        return []
    }
}

function saveOutbox(notes: OutboxNote[]): void {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(notes)) } catch { /* 滿了也只能算了 */ }
}

/** 把一段文字放進 outbox（同步完成，不碰網路）*/
export function enqueueNote(text: string): OutboxNote {
    const note: OutboxNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: text.trim(),
        createdAt: Date.now(),
    }
    saveOutbox([...loadOutbox(), note])
    return note
}

export function removeNotes(ids: Set<string>): void {
    saveOutbox(loadOutbox().filter(n => !ids.has(n.id)))
}

// ── 沖到雲端 ─────────────────────────────────────────────────────────────────

export interface FlushResult {
    ok: boolean
    /** 這次成功送上去的則數 */
    sent: number
    /** 還留在 outbox 裡的則數 */
    remaining: number
    error?: string
}

/**
 * 把 outbox 裡所有的速記追加到雲端的收件匣白板。
 *
 * ⚠️ 一定是「先拉最新的、在它上面追加、再整塊推回去」。
 * 直接拿手機上的舊版本來改再推，會把這段期間桌機加進收件匣的卡整批蓋掉
 * （整板 last-write-wins 的代價，見 docs/roadmap-mobile.md 風險表）。
 */
export async function flushOutbox(): Promise<FlushResult> {
    const notes = loadOutbox()
    if (notes.length === 0) return { ok: true, sent: 0, remaining: 0 }

    const pulled = await pullBoard(INBOX_BOARD_ID)
    if (!pulled.ok) return { ok: false, sent: 0, remaining: notes.length, error: pulled.error }

    // 雲端還沒有收件匣（使用者從沒同步過）就地建一塊。id 與桌機同一個常數，
    // 所以桌機那邊會認得它、直接合進自己的收件匣，不會變成第二塊板。
    const base: BoardRecord = pulled.data ?? {
        id: INBOX_BOARD_ID,
        name: '📥 收件匣',
        snapshot: null,
        thumbnail: null,
        updatedAt: 0,
        isInbox: true,
    }

    let snapshot = base.snapshot
    for (const note of notes) {
        // idPrefix 用 'm' 標記來自手機——日後排查「這張卡哪來的」時很有用
        snapshot = appendQuickCaptureCard(snapshot, note.text, 'm').snapshot
    }

    const updated: BoardRecord = { ...base, isInbox: true, snapshot, updatedAt: Date.now() }
    const pushed = await pushBoard(updated)
    if (!pushed.ok) return { ok: false, sent: 0, remaining: notes.length, error: pushed.error }

    removeNotes(new Set(notes.map(n => n.id)))
    return { ok: true, sent: notes.length, remaining: loadOutbox().length }
}
