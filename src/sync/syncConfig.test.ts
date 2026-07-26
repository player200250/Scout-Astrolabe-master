// @vitest-environment jsdom
// src/sync/syncConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSyncConfig, saveSyncConfig, clearSyncConfig, isSyncConfigured } from './syncConfig'

const LONG_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-anon-key-value'

describe('syncConfig', () => {
    beforeEach(() => { localStorage.clear() })

    it('沒設定過時回空字串，不會丟例外', () => {
        expect(loadSyncConfig()).toEqual({ url: '', anonKey: '' })
    })

    it('存了之後讀得回來', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })
        expect(loadSyncConfig()).toEqual({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })
    })

    it('URL 尾端斜線會被去掉（否則組出來的 API path 會多一槓）', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co///', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('前後空白會被清掉（貼上時很容易帶到）', () => {
        saveSyncConfig({ url: '  https://abc.supabase.co  ', anonKey: `  ${LONG_KEY}  ` })
        expect(loadSyncConfig()).toEqual({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })
    })

    it('localStorage 內容壞掉時回空設定而不是讓 App 掛掉', () => {
        localStorage.setItem('astrolabe-sync-config', '{壞掉的 JSON')
        expect(loadSyncConfig()).toEqual({ url: '', anonKey: '' })
    })

    it('clear 之後回到未設定', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })
        clearSyncConfig()
        expect(isSyncConfigured()).toBe(false)
    })

    describe('isSyncConfigured', () => {
        it('兩個值都填好才算設定完成', () => {
            expect(isSyncConfigured({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })).toBe(true)
        })

        it('缺 URL / 缺 key / URL 不是網址 / key 太短 都算沒設定完成', () => {
            expect(isSyncConfigured({ url: '', anonKey: LONG_KEY })).toBe(false)
            expect(isSyncConfigured({ url: 'https://abc.supabase.co', anonKey: '' })).toBe(false)
            expect(isSyncConfigured({ url: 'abc.supabase.co', anonKey: LONG_KEY })).toBe(false)
            expect(isSyncConfigured({ url: 'https://abc.supabase.co', anonKey: 'short' })).toBe(false)
        })
    })
})
