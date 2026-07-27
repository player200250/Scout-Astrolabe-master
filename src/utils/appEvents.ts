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

import type { BoardRecord, DeletedCardRecord } from '../db'
import type { SyncStatus } from '../sync/syncStatus'

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

    /**
     * 顯示一則非阻塞通知（TD9，取代 alert）。
     * 走事件匯流排是刻意的——這樣 utils/hooks 這些非元件的地方也能像 alert() 一樣隨處呼叫，
     * 由 App 掛的 <ToastHost/> 統一渲染。請用 utils/toast.ts 的 showToast() 而非直接 emit。
     */
    'ui-toast': {
        message: string
        kind: 'info' | 'success' | 'error'
        /** 可選的動作鈕（例：「立即載入」）。按下後 toast 自動關閉 */
        action?: { label: string; run: () => void }
        /** 自訂顯示時間；傳 null＝不自動消失（需要使用者做決定時用）*/
        durationMs?: number | null
    }

    /**
     * 要求使用者輸入一個名稱（TD9，取代 Electron renderer 不支援的 window.prompt）。
     * payload 帶 resolve callback＝把「一問一答」架在單向事件匯流排上；
     * 請用 utils/promptName.ts 的 promptName() 取得 Promise 介面，別直接 emit。
     */
    'ui-prompt': {
        title: string
        defaultValue: string
        placeholder?: string
        confirmLabel?: string
        resolve: (value: string | null) => void
    }

    /** 同步狀態變化（S0(b)）。由 syncEngine 發出，狀態列/雲端同步面板訂閱 */
    'sync-status-changed': SyncStatus

    /**
     * 從雲端拉回並已寫入 IndexedDB 的白板（S0(b)）。
     * useCloudSync 收到後把它們套進 React 的 boards state——不然畫面要等下次重載才看得到。
     * 可能包含被另一端軟刪除的板（`deletedAt` 有值），呼叫端要自行過濾出側邊欄要顯示的。
     */
    'sync-boards-updated': { boards: BoardRecord[] }

    /**
     * **正在開著的**那塊板在雲端有更新的版本（S0(b) 第 4 項）。
     * 刻意不靜默覆蓋——使用者可能正在這塊板上打字，一聲不響換掉畫布內容會直接毀掉工作。
     * payload 帶 `apply` callback（同 'ui-prompt' 的作法）：使用者按下提示才真的拉回來套用。
     */
    'sync-remote-newer': {
        boardId: string
        boardName: string
        remoteUpdatedAt: number
        apply: () => Promise<void>
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
