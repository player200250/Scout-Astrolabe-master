// @vitest-environment jsdom
// src/Usehotkeys.test.tsx
//
// useHotkeys 只在 window 掛一個 keydown listener，依按鍵分派到 actions。
// 這裡不需要真的 tldraw editor——只 mock 出 handler 會用到的方法即可，
// 重點驗證 B2「新增卡片」快捷鍵的分派（含 Shift 修飾鍵的分流）與既有行為不迴歸。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Editor } from 'tldraw'
import { useHotkeys, type HotkeyActions } from './Usehotkeys'

// 最小 editor：只放 handler 會碰到的方法，避免 null 短路。
function makeEditor(): Editor {
    return {
        setCurrentTool: vi.fn(),
        getSelectedShapeIds: () => [],
        deselect: vi.fn(),
        deleteShapes: vi.fn(),
        nudgeShapes: vi.fn(),
    } as unknown as Editor
}

// 把 actions 全 mock 成 vi.fn()，方便斷言哪個被呼叫。
function makeActions(): HotkeyActions {
    return {
        createTextCard: vi.fn(),
        createTodoCard: vi.fn(),
        createLinkCard: vi.fn(),
        createStickyCard: vi.fn(),
        createHeadingCard: vi.fn(),
        createTableCard: vi.fn(),
        openImageInput: vi.fn(),
        openSearch: vi.fn(),
        openHotkeyPanel: vi.fn(),
    }
}

function press(key: string, opts: Partial<KeyboardEventInit> = {}) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useHotkeys — 新增卡片快捷鍵（B2）', () => {
    let actions: HotkeyActions

    beforeEach(() => {
        actions = makeActions()
        renderHook(() => useHotkeys(makeEditor(), actions))
    })

    it('N 建立文字卡片、Shift+N 建立標題卡片', () => {
        press('n')
        expect(actions.createTextCard).toHaveBeenCalledTimes(1)
        expect(actions.createHeadingCard).not.toHaveBeenCalled()

        press('N', { shiftKey: true })
        expect(actions.createHeadingCard).toHaveBeenCalledTimes(1)
        // 文字卡片不應因 Shift+N 再被觸發
        expect(actions.createTextCard).toHaveBeenCalledTimes(1)
    })

    it('T 建立待辦清單、Shift+T 建立表格卡片', () => {
        press('t')
        expect(actions.createTodoCard).toHaveBeenCalledTimes(1)
        expect(actions.createTableCard).not.toHaveBeenCalled()

        press('T', { shiftKey: true })
        expect(actions.createTableCard).toHaveBeenCalledTimes(1)
        expect(actions.createTodoCard).toHaveBeenCalledTimes(1)
    })

    it('S 建立便利貼', () => {
        press('s')
        expect(actions.createStickyCard).toHaveBeenCalledTimes(1)
    })

    it('在 input 內不觸發新增卡片快捷鍵', () => {
        const input = document.createElement('input')
        document.body.appendChild(input)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
        expect(actions.createStickyCard).not.toHaveBeenCalled()
        input.remove()
    })
})
