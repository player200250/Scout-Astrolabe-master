// src/utils/trashUtils.ts
// 垃圾桶相關 utilities（從 TrashPanel.tsx 拆出）

import { db } from '../db'
import type { DeletedCardRecord } from '../db'

/** 將一個 shape 存入 deletedCards 資料表（加入垃圾桶） */
export async function saveCardToTrash(
    shapeId: string,
    shapeData: unknown,
    boardId: string,
    boardName: string,
    type: string,
    preview: string,
): Promise<void> {
    try {
        const record: DeletedCardRecord = {
            id: `dc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            shapeId,
            boardId,
            boardName,
            shapeData,
            deletedAt: Date.now(),
            type,
            preview,
        }
        await db.table('deletedCards').put(record)
    } catch (err) {
        console.error('[Trash] 儲存卡片失敗', err)
    }
}

/** 從 shape props 擷取一段預覽文字 */
export function getCardPreview(shape: { props?: Record<string, unknown> }): string {
    const p = shape.props ?? {}
    if (p.type === 'text' || p.type === 'journal') {
        const html = String(p.text ?? '')
        return html.replace(/<[^>]+>/g, '').slice(0, 80) || '（空白文字卡片）'
    }
    if (p.type === 'todo') return String(p.text ?? '') || '待辦清單'
    if (p.type === 'link') return String(p.title ?? p.url ?? '連結卡片')
    if (p.type === 'image') return '圖片卡片'
    if (p.type === 'board') return `白板卡: ${String(p.text ?? '')}`
    return '卡片'
}
