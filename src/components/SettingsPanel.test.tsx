// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import type { AppSettings } from '../electron-api'

afterEach(() => { cleanup(); delete (window as { electronAPI?: unknown }).electronAPI })

function mockApi(initial: AppSettings) {
    let push: ((s: AppSettings) => void) | null = null
    const api = {
        getAppSettings: vi.fn(async () => initial),
        setAppSetting: vi.fn(async (k: keyof AppSettings, v: boolean) => ({ ...initial, [k]: v })),
        onAppSettingsChanged: vi.fn((cb: (s: AppSettings) => void) => { push = cb; return () => { push = null } }),
    }
    ;(window as unknown as { electronAPI: unknown }).electronAPI = api
    return { api, push: (s: AppSettings) => push?.(s) }
}
const box = (label: string) => screen.getByText(label).closest('label')!.querySelector('input') as HTMLInputElement
const props = { onClose: vi.fn(), onToggleTheme: vi.fn(), onOpenPanel: vi.fn() }
const goto = (cat: string) => fireEvent.click(screen.getByRole('button', { name: cat }))

describe('SettingsPanel', () => {
    it('預設停在「外觀」；點分類換內容；勾勾在文字左邊', async () => {
        mockApi({ minimizeToTray: true, openAtLogin: false, mcpEnabled: false })
        render(<SettingsPanel {...props} />)
        await act(async () => {})
        expect(screen.getByRole('heading').textContent).toBe('外觀')
        expect(screen.queryByText('關閉視窗時最小化到托盤')).toBeNull()
        goto('資料')
        expect(screen.getByRole('heading').textContent).toBe('資料')
        expect(screen.getByText('資料安全中心')).toBeTruthy()
        goto('外觀')
        const label = screen.getByText('深色模式').closest('label')!
        expect(label.firstElementChild?.tagName).toBe('INPUT')
    })

    it('讀 main 的狀態；切開關會寫回 main', async () => {
        const { api } = mockApi({ minimizeToTray: true, openAtLogin: false, mcpEnabled: false })
        render(<SettingsPanel {...props} />)
        await act(async () => {})
        goto('視窗與啟動')
        expect(box('關閉視窗時最小化到托盤').checked).toBe(true)
        goto('連線與同步')
        expect(box('允許 Claude Code 連線').checked).toBe(false)
        await act(async () => { fireEvent.click(box('允許 Claude Code 連線')) })
        expect(api.setAppSetting).toHaveBeenCalledWith('mcpEnabled', true)
        expect(box('允許 Claude Code 連線').checked).toBe(true)
    })

    it('托盤那邊改了，這頁跟著變', async () => {
        const m = mockApi({ minimizeToTray: true, openAtLogin: false, mcpEnabled: false })
        render(<SettingsPanel {...props} />)
        await act(async () => {})
        goto('視窗與啟動')
        act(() => m.push({ minimizeToTray: false, openAtLogin: false, mcpEnabled: true }))
        expect(box('關閉視窗時最小化到托盤').checked).toBe(false)
        goto('連線與同步')
        expect(box('允許 Claude Code 連線').checked).toBe(true)
    })

    it('測試版（openAtLogin=null）不顯示開機啟動；沒有 electronAPI 就不顯示托盤設定', async () => {
        mockApi({ minimizeToTray: true, openAtLogin: null, mcpEnabled: false })
        render(<SettingsPanel {...props} />)
        await act(async () => {})
        goto('視窗與啟動')
        expect(screen.queryByText('開機時自動啟動')).toBeNull()
        expect(screen.getByText('開機時自動啟動：只有安裝版能設定。')).toBeTruthy()
        cleanup(); delete (window as { electronAPI?: unknown }).electronAPI
        render(<SettingsPanel {...props} />)
        await act(async () => {})
        goto('連線與同步')
        expect(screen.queryByText('允許 Claude Code 連線')).toBeNull()
        goto('番茄鐘')
        expect(screen.getByText('提示音')).toBeTruthy()
    })
})
