// src/utils/inboxTriage.ts
//
// Inbox Triage（N2）的純函式層。
// 把「快速捕捉丟進收件匣」的單向入口，補上另一端的出口：逐張過卡片，
// 每張只決定一件事——搬到白板／轉成任務／留著／丟垃圾桶（GTD 的 clarify 步驟）。
//
// 刻意不動資料模型：佇列只是既有 inbox snapshot 的唯讀投影，
// 決策由呼叫端（App.tsx）委派給既有 handler 執行。
// UI（InboxTriage.tsx）只負責顯示與鍵盤操作。

import type { TLEditorSnapshot } from 'tldraw'
import type { CardType } from '../components/card-shape/type/CardShape'
import { getSnapshotStore } from './snapshot'
import { splitTitleBody, splitTitleBodyFull, stripHtml } from './stringUtils'
import type { SnapshotShapeProps } from './snapshot'

/** 一張卡片在 triage 過程中的最終去向；'skipped' 代表看過但沒決定。 */
export type TriageDecision = 'moved' | 'task' | 'kept' | 'deleted'

export interface TriageItem {
    shapeId: string
    type: CardType
    /** 文字卡的 H1/H2 標題（無則 null） */
    title: string | null
    /** 預覽內文（已 strip HTML、截斷） */
    preview: string
    tags: string[]
    cardStatus: string
    priority: string
}

const PREVIEW_LIMIT = 280

/** 依卡片類型取一段可讀的預覽文字。text/journal 走 HTML 萃取，其餘給型別化描述。 */
export function triagePreview(props: Record<string, unknown>): { title: string | null; preview: string } {
    const type = props.type as string
    if (type === 'text' || type === 'journal') {
        const { title, body } = splitTitleBody(String(props.text ?? ''), PREVIEW_LIMIT)
        return { title, preview: body }
    }
    if (type === 'todo') {
        const todos = (props.todos ?? []) as { text?: string; checked?: boolean }[]
        const done = todos.filter(t => t.checked).length
        const lines = todos.slice(0, 6).map(t => `${t.checked ? '☑' : '☐'} ${t.text ?? ''}`).join('\n')
        return { title: `待辦（${done}/${todos.length}）`, preview: lines }
    }
    if (type === 'link') return { title: String(props.title ?? '連結'), preview: String(props.url ?? '') }
    if (type === 'file') return { title: String(props.originalName ?? '檔案'), preview: '' }
    if (type === 'image') return { title: '圖片', preview: '' }
    if (type === 'board') return { title: `白板卡：${stripHtml(String(props.text ?? ''))}`, preview: '' }
    return { title: null, preview: stripHtml(String(props.text ?? '')).slice(0, PREVIEW_LIMIT) }
}

/**
 * 首頁「收件匣預覽」一行要顯示的字（v1.8.4 報告 P3）。
 * 以前一律 stripHtml(text)：待辦卡的 text 是卡片標題，週回顧轉出來的待辦沒有標題，就顯示成「（無內容）」。
 * 待辦卡改成：有標題用標題，沒有就用第一個項目。
 */
export function inboxLineText(props: Record<string, unknown>): string {
    if (props.type === 'todo') {
        const title = stripHtml(String(props.text ?? ''))
        if (title) return title
        const first = ((props.todos ?? []) as { text?: string }[]).find(t => (t.text ?? '').trim())
        return first?.text?.trim() || '（空白待辦）'
    }
    const { title, preview } = triagePreview(props)
    return title || preview || '（無內容）'
}

/**
 * 由 inbox snapshot 建出 triage 佇列。
 *
 * 以 tldraw 的 fractional index 排序（＝建立順序），最舊的先處理——收件匣裡待最久的
 * 本來就最該先清。佇列在開啟面板時建一次即固定：處理途中會逐張改動 snapshot，
 * 若跟著重算會讓卡片在眼前跳位。
 */
export function buildTriageQueue(snapshot: TLEditorSnapshot | null): TriageItem[] {
    if (!snapshot) return []
    const store = getSnapshotStore(snapshot)
    return Object.values(store)
        .filter(r => r.typeName === 'shape' && r.type === 'card')
        .sort((a, b) => (a.index ?? '').localeCompare(b.index ?? ''))
        .map(r => {
            const props = (r.props ?? {}) as Record<string, unknown>
            const { title, preview } = triagePreview(props)
            return {
                shapeId: r.id,
                type: (props.type as CardType) ?? 'text',
                title,
                preview,
                tags: Array.isArray(props.tags) ? (props.tags as string[]) : [],
                cardStatus: String(props.cardStatus ?? 'none'),
                priority: String(props.priority ?? 'none'),
            }
        })
}

/** 游標前進；到底時停在 total（＝完成畫面）。 */
export function nextCursor(cursor: number, total: number): number {
    return Math.min(cursor + 1, total)
}

/** 游標後退；不會小於 0。 */
export function prevCursor(cursor: number): number {
    return Math.max(cursor - 1, 0)
}

export interface TriageProgress {
    /** 目前是第幾張（1-based，供顯示；完成時等於 total） */
    current: number
    total: number
    /** 0–100 */
    percent: number
}

export function triageProgress(cursor: number, total: number): TriageProgress {
    if (total === 0) return { current: 0, total: 0, percent: 100 }
    const current = Math.min(cursor + 1, total)
    return { current, total, percent: Math.round((cursor / total) * 100) }
}

export type TriageSummary = Record<TriageDecision, number>

/** 統計各決策張數，供完成畫面顯示。 */
export function summarizeDecisions(decisions: Record<string, TriageDecision>): TriageSummary {
    const summary: TriageSummary = { moved: 0, task: 0, kept: 0, deleted: 0 }
    for (const d of Object.values(decisions)) summary[d]++
    return summary
}

// ── 標為任務＝轉成待辦卡（v1.8.4 測試報告 P1-3）──────────────────────────────
// 舊做法只在文字卡上加 cardStatus: 'todo'，但任務中心與行事曆只認待辦卡的項目，
// 「標為任務」的卡從此在閉環裡消失。改成直接把文字卡轉成待辦卡。

/** 待辦卡：標題列＋每項一列（列高同 TodoContent 的 ITEM_HEIGHT） */
const TODO_BASE_H = 92
const TODO_ROW_H = 28
const TODO_MAX_H = 480

/** HTML → 每個區塊一行的純文字（空行去掉） */
function htmlToLines(html: string): string[] {
    if (!html) return []
    const broken = html.replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>|<br\s*\/?>/gi, '$&\n')
    const text = new DOMParser().parseFromString(broken, 'text/html').body.textContent ?? ''
    return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/**
 * 文字卡 → 待辦卡的 props 補丁；不是文字卡就回 null（呼叫端改用舊的狀態標記）。
 *
 * 內容一個字都不丟：有 H1/H2 標題就當待辦卡標題，其餘每個段落一個項目；
 * 只有標題沒有內文時，標題本身變成唯一的項目。不設到期日（之後在任務中心拖）。
 */
export function textCardToTodoPatch(
    props: Record<string, unknown>,
    makeId: () => string = () => Math.random().toString(36).slice(2, 8),
): Partial<SnapshotShapeProps> | null {
    if (props.type !== 'text') return null
    const html = String(props.text ?? '')
    const { title } = splitTitleBodyFull(html)
    const rest = title ? html.replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/i, ' ') : html
    let lines = htmlToLines(rest)
    let cardTitle = title ?? ''
    if (lines.length === 0) { lines = [cardTitle]; cardTitle = '' }
    const todos = lines.map(text => ({ id: makeId(), text, checked: false, dueDate: null }))
    const h = Math.min(TODO_MAX_H, Math.max(Number(props.h) || 0, TODO_BASE_H + TODO_ROW_H * todos.length))
    return { type: 'todo', text: cardTitle, todos, h }
}
