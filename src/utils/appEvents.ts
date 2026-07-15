// src/utils/appEvents.ts
//
// 應用程式內部跨元件事件匯流排（型別安全版本）
//
// 底層仍使用 window.CustomEvent，但透過 emitAppEvent / onAppEvent
// 強制 TypeScript 在編譯時檢查事件名稱與 payload 型別。
//
// 使用方式：
//   emit:  emitAppEvent('jump-to-card', { shapeId: '...' })
//   on:    const off = onAppEvent('jump-to-card', detail => { ... })
//          // 在 useEffect cleanup 中呼叫 off()

import type { DeletedCardRecord } from '../db'

// ── 每個事件的 payload 型別定義 ──────────────────────────────────────────

export interface AppEventPayloads {
    /**
     * 跳轉到指定卡片。
     * 兩種模式：
     *   - 指定 shapeId（＋可選 boardId / x / y）→ 直接跳轉
     *   - 指定 targetName → 依卡片標題名稱搜尋後跳轉（用於 [[card-name]] 連結）
     */
    'jump-to-card': {
        shapeId?: string
        boardId?: string
        x?: number
        y?: number
        targetName?: string
    }

    /** 垃圾桶計數變更，通知 UI 更新 badge（無 payload）*/
    'trash-count-changed': undefined

    /** 從垃圾桶永久刪除一個 shape，通知白板清除 undo 歷史 */
    'permanent-delete-shape': { shapeId: string; boardId: string }

    /** 從垃圾桶還原一張卡片，通知白板重新建立 shape */
    'restore-deleted-card': DeletedCardRecord

    /** 雙擊子板卡片，切換到對應白板 */
    'board-card-enter': { linkedBoardId: string }

    /** 雙擊文字卡片，開啟全螢幕編輯 modal */
    'text-card-edit': { shapeId: string }

    /** 將卡片移動到 Inbox 後，從原白板刪除該 shape */
    'delete-shape-from-editor': { shapeId: string }

    /**
     * 在編輯器外改動卡片屬性（Inbox Triage）後，同步套用到白板 editor。
     * 若該板此刻沒掛載 editor 則無人接收——snapshot 已先寫入 DB，下次開板即為新值。
     */
    'update-shape-props-in-editor': { shapeId: string; props: Record<string, unknown> }

    /** 新建子板後，在父板自動建立一張連結卡片 */
    'create-board-card-on': {
        targetBoardId: string
        linkedBoardId: string
        boardName: string
    }

    /** 刪除白板後，清除所有指向該白板的孤兒 board 卡片 */
    'cleanup-orphan-board-cards': { deletedBoardId: string }

    /** QuickCapture 建立文字卡後，在 Inbox 白板顯示該 shape */
    'quick-capture-card': {
        text: string
        x: number
        y: number
        shapeId: string
    }
}

export type AppEventName = keyof AppEventPayloads

// ── emitAppEvent ──────────────────────────────────────────────────────────

/** 發送一個應用程式事件（帶型別檢查）*/
export function emitAppEvent<K extends AppEventName>(
    name: K,
    ...args: AppEventPayloads[K] extends undefined ? [] : [detail: AppEventPayloads[K]]
): void {
    window.dispatchEvent(new CustomEvent(name, { detail: args[0] }))
}

// ── onAppEvent ────────────────────────────────────────────────────────────

/** 訂閱一個應用程式事件，回傳 unsubscribe 函式（在 useEffect cleanup 呼叫）*/
export function onAppEvent<K extends AppEventName>(
    name: K,
    handler: AppEventPayloads[K] extends undefined
        ? () => void
        : (detail: AppEventPayloads[K]) => void
): () => void {
    const listener = (e: Event) => {
        const detail = (e as CustomEvent<AppEventPayloads[K]>).detail
        ;(handler as (d: AppEventPayloads[K]) => void)(detail)
    }
    window.addEventListener(name, listener)
    return () => window.removeEventListener(name, listener)
}
