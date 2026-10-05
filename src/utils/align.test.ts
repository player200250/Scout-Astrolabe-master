// src/utils/align.test.ts
//
// RC24 的重現數字：A＝x100 y100 240×180、B＝x400 y100 280×320。
// 工具列舊實作只看左上角，靠右對到 400、靠下對到 y100——這裡把正確的參考線釘死。
import { describe, it, expect, vi } from 'vitest'
import { alignOffsets, alignShapes } from './align'
import type { AlignDirection, Rect } from './align'

const A: Rect = { x: 100, y: 100, w: 240, h: 180 }
const B: Rect = { x: 400, y: 100, w: 280, h: 320 }

const apply = (rects: Rect[], dir: AlignDirection) =>
    alignOffsets(rects, dir).map((o, i) => ({ ...rects[i], x: rects[i].x + o.dx, y: rects[i].y + o.dy }))

describe('alignOffsets', () => {
    it('靠左／靠上：對齊到整組最小的左緣／上緣', () => {
        expect(apply([A, B], 'left').map(r => r.x)).toEqual([100, 100])
        expect(apply([A, B], 'top').map(r => r.y)).toEqual([100, 100])
    })

    it('靠右：右緣都對到整組最右（680），不是最大的左上角 x（400）', () => {
        expect(apply([A, B], 'right').map(r => r.x + r.w)).toEqual([680, 680])
    })

    it('靠下：底邊都對到整組最下（420），不是最大的左上角 y（100）', () => {
        expect(apply([A, B], 'bottom').map(r => r.y + r.h)).toEqual([420, 420])
    })

    it('水平／垂直置中：中心對到整組外框的中線', () => {
        expect(apply([A, B], 'centerX').map(r => r.x + r.w / 2)).toEqual([390, 390])
        expect(apply([A, B], 'centerY').map(r => r.y + r.h / 2)).toEqual([260, 260])
    })

    it('只動對齊的那一軸', () => {
        for (const o of alignOffsets([A, B], 'right')) expect(o.dy).toBe(0)
        for (const o of alignOffsets([A, B], 'bottom')) expect(o.dx).toBe(0)
    })
})

describe('alignShapes', () => {
    // 最小替身：形狀座標＝頁面外框（無父層、無旋轉）
    const makeEditor = (shapes: { id: string; type: string; x: number; y: number; w: number; h: number }[]) => {
        const updateShapes = vi.fn()
        const editor = {
            getShape: (id: string) => shapes.find(s => s.id === id),
            getShapePageBounds: (id: string) => {
                const s = shapes.find(s => s.id === id)
                return s && { x: s.x, y: s.y, w: s.w, h: s.h }
            },
            batch: (fn: () => void) => fn(),
            updateShapes,
        }
        return { editor: editor as never, updateShapes }
    }

    it('卡片與非卡片形狀（geo）混選也用實際寬高對齊', () => {
        const { editor, updateShapes } = makeEditor([
            { id: 'shape:a', type: 'card', ...A },
            { id: 'shape:g', type: 'geo', ...B },
        ])
        alignShapes(editor, ['shape:a', 'shape:g'] as never, 'bottom')
        expect(updateShapes).toHaveBeenCalledWith([
            { id: 'shape:a', type: 'card', x: 100, y: 240 },
            { id: 'shape:g', type: 'geo', x: 400, y: 100 },
        ])
    })

    it('少於 2 個形狀不動', () => {
        const { editor, updateShapes } = makeEditor([{ id: 'shape:a', type: 'card', ...A }])
        alignShapes(editor, ['shape:a'] as never, 'right')
        expect(updateShapes).not.toHaveBeenCalled()
    })
})
