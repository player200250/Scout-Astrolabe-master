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

    // 這組是真的踩過的：Supabase 後台有些欄位顯示的是 Data API endpoint
    // `https://xxx.supabase.co/rest/v1`，貼進來的話 supabase-js 會再接一段，
    // 組出 /rest/v1/auth/v1/token 而 404。正規化必須把路徑砍掉只留 origin。
    it('貼到帶路徑的 Data API endpoint（/rest/v1）會被砍成 origin', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co/rest/v1', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('其他常見誤貼的路徑一樣砍掉（/auth/v1、後台 dashboard 網址）', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co/auth/v1/', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
        saveSyncConfig({ url: 'https://abc.supabase.co/rest/v1?apikey=xxx', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('沒打 https:// 也能用（自動補上）', () => {
        saveSyncConfig({ url: 'abc.supabase.co', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('自架 Supabase 的非標準 port 會保留', () => {
        saveSyncConfig({ url: 'http://localhost:54321/rest/v1', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('http://localhost:54321')
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
