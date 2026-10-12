// src/utils/loginStartup.test.ts — 開機自動啟動（根目錄 loginStartup.js）
import { describe, it, expect } from 'vitest'
import { LOGIN_ARG, launchedAtLogin, startHidden, loginItemOptions } from '../../loginStartup.js'

describe('launchedAtLogin', () => {
    it('有開機參數才算開機啟動', () => {
        expect(launchedAtLogin(['C:/Scout/Scout.exe', LOGIN_ARG])).toBe(true)
        expect(launchedAtLogin(['C:/Scout/Scout.exe'])).toBe(false)
        expect(launchedAtLogin(['C:/Scout/Scout.exe', '--scout-login-x'])).toBe(false)
    })
})

describe('startHidden', () => {
    it('開機啟動、有托盤、最小化到托盤：藏起來', () => {
        expect(startHidden({ atLogin: true, hasTray: true, minimizeToTray: true })).toBe(true)
    })

    it('手動打開一定顯示', () => {
        expect(startHidden({ atLogin: false, hasTray: true, minimizeToTray: true })).toBe(false)
    })

    it('沒有托盤或不收進托盤：顯示，不然視窗叫不回來', () => {
        expect(startHidden({ atLogin: true, hasTray: false, minimizeToTray: true })).toBe(false)
        expect(startHidden({ atLogin: true, hasTray: true, minimizeToTray: false })).toBe(false)
    })
})

describe('loginItemOptions', () => {
    it('註冊和查詢用同一組 path／args', () => {
        expect(loginItemOptions('C:/Scout/Scout.exe')).toEqual({ path: 'C:/Scout/Scout.exe', args: [LOGIN_ARG] })
    })
})
