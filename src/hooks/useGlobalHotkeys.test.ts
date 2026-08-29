// @vitest-environment jsdom
// src/hooks/useGlobalHotkeys.test.ts
//
// 兩層各測各的：
//   1) matchHotkey：純函式，餵假事件物件驗「哪個組合對應哪個動作」
//   2) useGlobalHotkeys：真的往 window 派 keydown，驗有掛上、有 preventDefault、卸載後有解掉
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { matchHotkey, useGlobalHotkeys, HOTKEYS, type HotkeyEventLike } from './useGlobalHotkeys'

const ev = (key: string, mods: Partial<HotkeyEventLike> = {}): HotkeyEventLike => ({
    key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
})

describe('matchHotkey', () => {
    it('沒按 Ctrl／⌘ 一律不匹配', () => {
        expect(matchHotkey(ev('o', { shiftKey: true }))).toBeNull()
        expect(matchHotkey(ev('k'))).toBeNull()
    })

    it('⌘ 與 Ctrl 等價（Mac／Windows 同一組快捷鍵）', () => {
        expect(matchHotkey(ev('k', { ctrlKey: true }))).toEqual(matchHotkey(ev('k', { metaKey: true })))
    })

    it('Ctrl+Shift 系列各自對到正確的面板', () => {
        const shift = (key: string) => matchHotkey(ev(key, { ctrlKey: true, shiftKey: true }))
        expect(shift('o')).toEqual({ type: 'toggle', panel: 'overview' })
        expect(shift('c')).toEqual({ type: 'toggle', panel: 'reviewCenter' })
        expect(shift('g')).toEqual({ type: 'toggle', panel: 'knowledgeGraph' })
        expect(shift('l')).toEqual({ type: 'toggle', panel: 'cardLibrary' })
        expect(shift('t')).toEqual({ type: 'toggle', panel: 'trash' })
        expect(shift('e')).toEqual({ type: 'toggle', panel: 'inboxTriage' })
        expect(shift('i')).toEqual({ type: 'goToInbox' })
    })

    it('不帶 Shift 的系列：Ctrl+Space／Ctrl+P／Ctrl+K', () => {
        const plain = (key: string) => matchHotkey(ev(key, { ctrlKey: true }))
        expect(plain(' ')).toEqual({ type: 'toggle', panel: 'quickCapture' })
        expect(plain('p')).toEqual({ type: 'open', panel: 'quickSwitcher' })
        expect(plain('k')).toEqual({ type: 'toggle', panel: 'commandPalette' })
    })

    it('大小寫都吃（Shift 會讓 e.key 變大寫）', () => {
        expect(matchHotkey(ev('O', { ctrlKey: true, shiftKey: true })))
            .toEqual({ type: 'toggle', panel: 'overview' })
    })

    it('需要 Shift 的組合少按 Shift 就不匹配，反之亦然', () => {
        expect(matchHotkey(ev('o', { ctrlKey: true }))).toBeNull()
        expect(matchHotkey(ev('k', { ctrlKey: true, shiftKey: true }))).toBeNull()
    })

    it('不帶 Shift 的組合多按 Alt 就不匹配（避開 Ctrl+Alt＝AltGr）', () => {
        expect(matchHotkey(ev('k', { ctrlKey: true, altKey: true }))).toBeNull()
    })

    it('沒登記的鍵回 null', () => {
        expect(matchHotkey(ev('z', { ctrlKey: true }))).toBeNull()
    })

    it('對照表沒有重複的 key + shift 組合', () => {
        const seen = HOTKEYS.map(b => `${b.key}/${b.shift}`)
        expect(new Set(seen).size).toBe(seen.length)
    })
})

describe('useGlobalHotkeys', () => {
    const actions = () => ({ openPanel: vi.fn(), togglePanel: vi.fn(), goToInbox: vi.fn() })
    const press = (key: string, init: KeyboardEventInit = {}) => {
        const e = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
        window.dispatchEvent(e)
        return e
    }

    it('Ctrl+K 呼叫 togglePanel(commandPalette) 並擋掉預設行為', () => {
        const a = actions()
        renderHook(() => useGlobalHotkeys(a))
        const e = press('k', { ctrlKey: true })
        expect(a.togglePanel).toHaveBeenCalledWith('commandPalette')
        expect(e.defaultPrevented).toBe(true)
    })

    it('Ctrl+P 走的是 openPanel 不是 togglePanel', () => {
        const a = actions()
        renderHook(() => useGlobalHotkeys(a))
        press('p', { ctrlKey: true })
        expect(a.openPanel).toHaveBeenCalledWith('quickSwitcher')
        expect(a.togglePanel).not.toHaveBeenCalled()
    })

    it('Ctrl+Shift+I 走 goToInbox', () => {
        const a = actions()
        renderHook(() => useGlobalHotkeys(a))
        press('i', { ctrlKey: true, shiftKey: true })
        expect(a.goToInbox).toHaveBeenCalledTimes(1)
    })

    it('沒登記的鍵不動作、也不擋預設行為（不能吃掉使用者的打字）', () => {
        const a = actions()
        renderHook(() => useGlobalHotkeys(a))
        const e = press('z', { ctrlKey: true })
        expect(a.openPanel).not.toHaveBeenCalled()
        expect(a.togglePanel).not.toHaveBeenCalled()
        expect(a.goToInbox).not.toHaveBeenCalled()
        expect(e.defaultPrevented).toBe(false)
    })

    it('unmount 後解除監聽（不會殘留在 window 上）', () => {
        const a = actions()
        const { unmount } = renderHook(() => useGlobalHotkeys(a))
        unmount()
        press('k', { ctrlKey: true })
        expect(a.togglePanel).not.toHaveBeenCalled()
    })
})
