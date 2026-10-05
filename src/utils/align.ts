// src/utils/align.ts
// 對齊的唯一實作——右鍵選單與左側工具列共用（RC24：工具列原本自己算一份，
// 只取各形狀左上角、沒加寬高，導致靠右／置中／靠下全錯）。

import type { Editor, TLShapeId } from 'tldraw'

export type AlignDirection = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

export interface Rect { x: number; y: number; w: number; h: number }

/** 每個矩形要移動多少（dx, dy）才能對齊；參考線取整組的外框。 */
export function alignOffsets(rects: Rect[], direction: AlignDirection): { dx: number; dy: number }[] {
    const minX = Math.min(...rects.map(r => r.x))
    const maxX = Math.max(...rects.map(r => r.x + r.w))
    const minY = Math.min(...rects.map(r => r.y))
    const maxY = Math.max(...rects.map(r => r.y + r.h))
    return rects.map(r => {
        switch (direction) {
            case 'left':    return { dx: minX - r.x, dy: 0 }
            case 'right':   return { dx: maxX - (r.x + r.w), dy: 0 }
            case 'centerX': return { dx: (minX + maxX) / 2 - (r.x + r.w / 2), dy: 0 }
            case 'top':     return { dx: 0, dy: minY - r.y }
            case 'bottom':  return { dx: 0, dy: maxY - (r.y + r.h) }
            case 'centerY': return { dx: 0, dy: (minY + maxY) / 2 - (r.y + r.h / 2) }
        }
    })
}

/** 用 tldraw 量到的頁面外框對齊——不限卡片，方框／箭頭等形狀也算得對。少於 2 個不動。 */
export function alignShapes(editor: Editor, ids: TLShapeId[], direction: AlignDirection) {
    const items = ids.flatMap(id => {
        const shape = editor.getShape(id)
        const bounds = editor.getShapePageBounds(id)
        return shape && bounds ? [{ shape, rect: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } }] : []
    })
    if (items.length < 2) return
    const offsets = alignOffsets(items.map(i => i.rect), direction)
    editor.batch(() => {
        editor.updateShapes(items.map(({ shape }, i) => ({
            id: shape.id, type: shape.type,
            x: shape.x + offsets[i].dx, y: shape.y + offsets[i].dy,
        })))
    })
}
