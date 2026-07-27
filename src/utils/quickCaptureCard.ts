// src/utils/quickCaptureCard.ts
// 「把一段文字變成收件匣裡的一張文字卡」——桌機與手機 PWA 共用的唯一實作。
//
// 抽出來的理由很實際：手機端（S1）做的事情跟桌機的快速捕捉一模一樣，只差在
// 結果是寫進雲端而不是 IndexedDB。如果兩邊各寫一份，卡片 props 只要有一欄對不上，
// 症狀會是「手機記的東西在桌機打不開/顯示怪怪的」，而且很難查——
// 這正是本專案文件漂移教訓裡「型別欄位級漂移」的那一類。
//
// ⚠️ 這個檔案刻意只依賴 type-only 的 tldraw 匯入，**不能引入任何 tldraw 執行期程式碼**：
// 手機 PWA 的 bundle 不跑 tldraw（見 docs/roadmap-mobile.md 第 2 節）。
import type { TLEditorSnapshot } from 'tldraw'
import { toMutableSnapshot, toTLEditorSnapshot } from './snapshot'
import { ensurePageScaffold, lastShapeIndex, nextGridSlot } from './snapshotCards'

export interface QuickCaptureResult {
    snapshot: TLEditorSnapshot
    shapeId: string
    x: number
    y: number
}

/**
 * 在 snapshot 尾端追加一張文字卡（收件匣快速捕捉用），回傳新的 snapshot。
 *
 * props 這一串必須與 CardShape 的預設值一致（見 components/card-shape/type/CardShape.ts）；
 * 少一欄不會當場出錯，而是等到那張卡被開啟時才出現奇怪的行為。
 */
export function appendQuickCaptureCard(
    snapshot: TLEditorSnapshot | null,
    text: string,
    idPrefix = 'qc',
): QuickCaptureResult {
    const snap = toMutableSnapshot(snapshot)
    const store = snap.document.store

    const pageId = ensurePageScaffold(store)
    const newIndex = lastShapeIndex(store) + 'V'
    // D6：收件匣用網格落點，避免快速捕捉卡一路往右排成超長橫列
    const { x, y } = nextGridSlot(store)

    const shapeId = `shape:${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    store[shapeId] = {
        typeName: 'shape', id: shapeId, type: 'card',
        x, y, rotation: 0, index: newIndex,
        parentId: pageId, isLocked: false, opacity: 1, meta: {},
        props: {
            type: 'text', text,
            image: null, todos: [], url: '',
            linkEmbedUrl: null, journalDate: null,
            state: 'idle', color: 'none', w: 240, h: 180,
            cardStatus: 'none', priority: 'none', tags: [],
        },
    }

    return { snapshot: toTLEditorSnapshot(snap), shapeId, x, y }
}
