// src/utils/snapshotPatch.ts
//
// 「改一張卡的某個欄位」的純函式（S3 手機編輯）。
//
// ── 為什麼要獨立一層 ────────────────────────────────────────────────────────
// 桌機改卡片走的是 tldraw 的 `editor.updateShape`——那需要一個活著的編輯器。
// 手機沒有 tldraw，只能直接改 snapshot JSON。這裡就是那條路：
// 輸入一份 snapshot、輸出一份新的 snapshot，**不改原本的**。
//
// ⚠️ 一律回新物件（不 mutate 傳進來的 snapshot）。理由不是潔癖：
// 手機端的合併需要拿「改之前」與「改之後」兩份去比對，就地改掉的話
// base 會跟著變，合併就永遠算不出「本機動過什麼」。
import { getSnapshotStore, withUpdatedStore } from './snapshot'
import type { TLEditorSnapshot } from 'tldraw'

/** 只改一張 shape 的 props，其餘原封不動；找不到那張卡就回原 snapshot */
function patchCardProps(
    snapshot: TLEditorSnapshot,
    shapeId: string,
    patch: (props: Record<string, unknown>) => Record<string, unknown> | null,
): TLEditorSnapshot {
    const store = getSnapshotStore(snapshot)
    const rec = store[shapeId]
    if (!rec || rec.typeName !== 'shape') return snapshot

    const nextProps = patch((rec.props ?? {}) as Record<string, unknown>)
    if (nextProps === null) return snapshot

    return withUpdatedStore(snapshot, {
        ...store,
        [shapeId]: { ...rec, props: nextProps },
    })
}

/**
 * 勾／取消勾一個待辦項目。
 *
 * ⚠️ 用 **todo 的 id** 定位，不是陣列索引。索引會隨著另一端新增/刪除項目而位移，
 * 拿索引去勾等於「勾到當時排在第 3 個的那一項」，兩端一起動時會勾錯人。
 */
export function toggleTodo(
    snapshot: TLEditorSnapshot,
    shapeId: string,
    todoId: string,
    checked: boolean,
): TLEditorSnapshot {
    return patchCardProps(snapshot, shapeId, props => {
        const todos = props.todos
        if (!Array.isArray(todos)) return null
        let hit = false
        const next = (todos as { id?: string }[]).map(t => {
            if (t?.id !== todoId) return t
            hit = true
            return { ...t, checked }
        })
        return hit ? { ...props, todos: next } : null
    })
}

/**
 * 換掉文字卡的內容。
 *
 * ⚠️ 傳進來的是**純文字**（手機上編輯的就是純文字），這裡包成 `<p>` 段落再存。
 * 直接把純文字塞進 `props.text` 的話，桌機那邊用 TipTap 讀它會把整段當成一行、
 * 換行全部消失——因為那個欄位的約定一直是 HTML。
 */
export function setCardText(
    snapshot: TLEditorSnapshot,
    shapeId: string,
    plainText: string,
): TLEditorSnapshot {
    return patchCardProps(snapshot, shapeId, props => ({ ...props, text: plainTextToHtml(plainText) }))
}

/** 純文字 → TipTap 認得的最小 HTML（每一行一個 `<p>`，空行保留成空段落）*/
export function plainTextToHtml(text: string): string {
    if (!text.trim()) return ''
    return text
        .split('\n')
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('')
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/** 改卡片狀態（none / todo / in-progress / done）*/
export function setCardStatus(
    snapshot: TLEditorSnapshot,
    shapeId: string,
    cardStatus: string,
): TLEditorSnapshot {
    return patchCardProps(snapshot, shapeId, props => ({ ...props, cardStatus }))
}

/** 改優先級（none / low / medium / high）*/
export function setCardPriority(
    snapshot: TLEditorSnapshot,
    shapeId: string,
    priority: string,
): TLEditorSnapshot {
    return patchCardProps(snapshot, shapeId, props => ({ ...props, priority }))
}
