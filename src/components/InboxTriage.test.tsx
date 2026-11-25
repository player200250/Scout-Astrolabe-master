// @vitest-environment jsdom
// src/components/InboxTriage.test.tsx
//
// v1.8.4 測試報告：
// - P1-2 整理模式按 T，白板的單鍵快捷鍵（T＝新增待辦卡）也被觸發，畫布多一張空白卡
// - P1-3 「標為任務」只加狀態標籤，任務中心看不到 ⇒ 改成文字卡直接轉成待辦卡
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { InboxTriage } from './InboxTriage'

const inbox = (cards: Record<string, Record<string, unknown>>): BoardRecord => ({
    id: 'inbox_board', name: '收件匣', isInbox: true, thumbnail: null, updatedAt: 0,
    snapshot: {
        document: {
            store: Object.fromEntries(Object.entries(cards).map(([id, props], i) => [id, {
                typeName: 'shape', id, type: 'card', x: 0, y: 0, index: `a${i + 1}`, props,
            }])),
            schema: { schemaVersion: 2, sequences: {} },
        },
        session: {},
    } as unknown as TLEditorSnapshot,
})

const setup = (cards: Record<string, Record<string, unknown>>) => {
    const onUpdateCardProps = vi.fn()
    render(<InboxTriage boards={[inbox(cards)]} onMoveCard={vi.fn()} onUpdateCardProps={onUpdateCardProps}
        onTrashCard={vi.fn()} onClose={vi.fn()} />)
    return { onUpdateCardProps }
}

/** 模擬 useHotkeys：它掛在 window 的冒泡階段 */
const listenBubble = () => {
    const seen: string[] = []
    const h = (e: KeyboardEvent) => { seen.push(e.key) }
    window.addEventListener('keydown', h)
    return { seen, off: () => window.removeEventListener('keydown', h) }
}

const press = (key: string, init: KeyboardEventInit = {}) =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

afterEach(() => cleanup())

describe('InboxTriage 鍵盤', () => {
    it('整理模式處理掉的鍵不會再傳到白板快捷鍵（T、方向鍵）', () => {
        setup({ 'shape:a': { type: 'text', text: '<p>a</p>' }, 'shape:b': { type: 'text', text: '<p>b</p>' } })
        const bubble = listenBubble()
        for (const k of ['ArrowRight', 'ArrowLeft', 't']) press(k)
        bubble.off()
        expect(bubble.seen).toEqual([])
    })

    it('帶 Ctrl 的組合鍵不歸整理模式管（照常傳下去）', () => {
        const { onUpdateCardProps } = setup({ 'shape:a': { type: 'text', text: '<p>a</p>' } })
        const bubble = listenBubble()
        press('t', { ctrlKey: true })
        bubble.off()
        expect(bubble.seen).toEqual(['t'])
        expect(onUpdateCardProps).not.toHaveBeenCalled()
    })
})

describe('InboxTriage 標為任務', () => {
    it('文字卡 ⇒ 轉成待辦卡（內容變成項目）', () => {
        const { onUpdateCardProps } = setup({ 'shape:a': { type: 'text', text: '<p>買牛奶</p>', h: 180 } })
        press('t')
        expect(onUpdateCardProps).toHaveBeenCalledWith('shape:a', expect.objectContaining({
            type: 'todo', todos: [expect.objectContaining({ text: '買牛奶', checked: false })],
        }))
    })

    it('圖片卡沒有文字可轉 ⇒ 維持舊行為（只加狀態）', () => {
        const { onUpdateCardProps } = setup({ 'shape:a': { type: 'image' } })
        press('t')
        expect(onUpdateCardProps).toHaveBeenCalledWith('shape:a', { cardStatus: 'todo' })
    })
})
