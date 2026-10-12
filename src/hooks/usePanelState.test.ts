// @vitest-environment jsdom
// src/hooks/usePanelState.test.ts
//
// usePanelState（A1）只是一包 boolean state，重點驗證：
//   1) 初始全部關閉
//   2) open/close/toggle 各自只動到指定的 panel，不影響其他
//   3) open 已開、close 已關時回傳同一個 panels 物件（避免無謂 re-render）
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanelState, PANEL_NAMES, showOnlyPanel, PANELS_SAFE_TO_CLOSE } from './usePanelState'

describe('usePanelState', () => {
    it('初始時所有面板皆為關閉', () => {
        const { result } = renderHook(() => usePanelState())
        for (const name of PANEL_NAMES) {
            expect(result.current.panels[name]).toBe(false)
        }
    })

    it('openPanel 只開啟指定面板，其餘維持關閉', () => {
        const { result } = renderHook(() => usePanelState())
        act(() => result.current.openPanel('search'))
        expect(result.current.panels.search).toBe(true)
        expect(result.current.panels.trash).toBe(false)
        expect(result.current.panels.taskCenter).toBe(false)
    })

    it('closePanel 關閉指定面板', () => {
        const { result } = renderHook(() => usePanelState())
        act(() => result.current.openPanel('trash'))
        expect(result.current.panels.trash).toBe(true)
        act(() => result.current.closePanel('trash'))
        expect(result.current.panels.trash).toBe(false)
    })

    it('togglePanel 反轉指定面板狀態', () => {
        const { result } = renderHook(() => usePanelState())
        act(() => result.current.togglePanel('overview'))
        expect(result.current.panels.overview).toBe(true)
        act(() => result.current.togglePanel('overview'))
        expect(result.current.panels.overview).toBe(false)
    })

    it('open 已開的面板時 panels 物件參考不變（不觸發無謂 re-render）', () => {
        const { result } = renderHook(() => usePanelState())
        act(() => result.current.openPanel('filter'))
        const ref = result.current.panels
        act(() => result.current.openPanel('filter'))
        expect(result.current.panels).toBe(ref)
    })

    it('close 已關的面板時 panels 物件參考不變', () => {
        const { result } = renderHook(() => usePanelState())
        const ref = result.current.panels
        act(() => result.current.closePanel('backup'))
        expect(result.current.panels).toBe(ref)
    })

    it('多個面板可同時開啟', () => {
        const { result } = renderHook(() => usePanelState())
        act(() => {
            result.current.openPanel('search')
            result.current.openPanel('taskCenter')
        })
        expect(result.current.panels.search).toBe(true)
        expect(result.current.panels.taskCenter).toBe(true)
    })
})

describe('showOnlyPanel', () => {
    const closed = Object.fromEntries(PANEL_NAMES.map(n => [n, false])) as Parameters<typeof showOnlyPanel>[0]

    it('關掉會蓋住它的面板，再開指定的', () => {
        const next = showOnlyPanel({ ...closed, inboxTriage: true, taskCenter: true }, 'dataSafety')
        expect(next.dataSafety).toBe(true)
        expect(next.inboxTriage).toBe(false)
        expect(next.taskCenter).toBe(false)
    })

    it('有打到一半的東西的面板不關', () => {
        const next = showOnlyPanel({ ...closed, quickCapture: true, reviewCenter: true, tagManager: true }, 'inboxTriage')
        expect(next.quickCapture).toBe(true)
        expect(next.reviewCenter).toBe(true)
        expect(next.tagManager).toBe(true)
        expect(PANELS_SAFE_TO_CLOSE).not.toContain('quickCapture')
    })

    it('null＝只收面板；沒變就回傳同一個物件', () => {
        expect(showOnlyPanel({ ...closed, dataSafety: true }, null).dataSafety).toBe(false)
        const same = { ...closed, dataSafety: true }
        expect(showOnlyPanel(same, 'dataSafety')).toBe(same)
    })
})
