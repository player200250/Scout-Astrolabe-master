// @vitest-environment jsdom
// src/utils/appEvents.test.ts
//
// 這個檔案需要 window / CustomEvent，所以用上面那行註解
// 把「這一個檔」切換成 jsdom 環境（其餘檔案仍用 node）。
import { describe, it, expect, vi } from 'vitest'
import { emitAppEvent, onAppEvent } from './appEvents'

describe('appEvents 事件匯流排', () => {
    it('emit 後，訂閱者收到對應的 payload', () => {
        const handler = vi.fn() // 間諜函式：記錄被呼叫了幾次、收到什麼參數
        const off = onAppEvent('jump-to-card', handler)

        emitAppEvent('jump-to-card', { shapeId: 'abc' })

        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler).toHaveBeenCalledWith({ shapeId: 'abc' })
        off()
    })

    it('取消訂閱（呼叫回傳的 off）後不再收到事件', () => {
        const handler = vi.fn()
        const off = onAppEvent('text-card-edit', handler)

        off() // 先取消訂閱
        emitAppEvent('text-card-edit', { shapeId: 'x' })

        expect(handler).not.toHaveBeenCalled()
    })

    it('無 payload 的事件也能正常 emit / 接收', () => {
        const handler = vi.fn()
        const off = onAppEvent('trash-count-changed', handler)

        emitAppEvent('trash-count-changed')

        expect(handler).toHaveBeenCalledTimes(1)
        off()
    })

    it('多個訂閱者都會收到同一個事件', () => {
        const a = vi.fn()
        const b = vi.fn()
        const offA = onAppEvent('board-card-enter', a)
        const offB = onAppEvent('board-card-enter', b)

        emitAppEvent('board-card-enter', { linkedBoardId: 'b1' })

        expect(a).toHaveBeenCalledWith({ linkedBoardId: 'b1' })
        expect(b).toHaveBeenCalledWith({ linkedBoardId: 'b1' })
        offA()
        offB()
    })

    it('不同事件名稱互不干擾', () => {
        const jump = vi.fn()
        const edit = vi.fn()
        const offJump = onAppEvent('jump-to-card', jump)
        const offEdit = onAppEvent('text-card-edit', edit)

        emitAppEvent('jump-to-card', { shapeId: 'only-jump' })

        expect(jump).toHaveBeenCalledTimes(1)
        expect(edit).not.toHaveBeenCalled()
        offJump()
        offEdit()
    })
})
