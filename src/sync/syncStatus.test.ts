// src/sync/syncStatus.test.ts
import { describe, it, expect } from 'vitest'
import { describeSyncStatus, formatAgo, isSyncAttention, INITIAL_SYNC_STATUS } from './syncStatus'

const status = (patch: Partial<typeof INITIAL_SYNC_STATUS>) => ({ ...INITIAL_SYNC_STATUS, ...patch })

describe('formatAgo', () => {
    it('一分鐘內算「剛剛」', () => {
        expect(formatAgo(0)).toBe('剛剛')
        expect(formatAgo(59_000)).toBe('剛剛')
    })

    it('分 / 時 / 天各自進位', () => {
        expect(formatAgo(60_000)).toBe('1 分鐘前')
        expect(formatAgo(59 * 60_000)).toBe('59 分鐘前')
        expect(formatAgo(60 * 60_000)).toBe('1 小時前')
        expect(formatAgo(25 * 3600_000)).toBe('1 天前')
    })

    // 兩端時鐘有落差時 elapsed 可能是負的，不該顯示「-1 分鐘前」
    it('負值（時鐘偏差）顯示「剛剛」而不是負數', () => {
        expect(formatAgo(-5000)).toBe('剛剛')
    })
})

describe('describeSyncStatus', () => {
    it('各階段都有對應文字', () => {
        expect(describeSyncStatus(status({ phase: 'disabled' }))).toBe('未啟用')
        expect(describeSyncStatus(status({ phase: 'paused' }))).toBe('自動同步已關閉')
        expect(describeSyncStatus(status({ phase: 'syncing' }))).toBe('同步中…')
        expect(describeSyncStatus(status({ phase: 'pending', pendingCount: 3 }))).toBe('3 塊待上傳')
        expect(describeSyncStatus(status({ phase: 'error', lastError: '連不上' }))).toBe('同步失敗：連不上')
    })

    it('idle 帶上「多久以前同步的」', () => {
        const now = 1_000_000
        expect(describeSyncStatus(status({ phase: 'idle', lastSyncedAt: now - 120_000 }), now))
            .toBe('已同步 · 2 分鐘前')
    })

    it('還沒同步過的 idle 不顯示時間', () => {
        expect(describeSyncStatus(status({ phase: 'idle', lastSyncedAt: null }))).toBe('已同步')
    })
})

describe('isSyncAttention', () => {
    it('錯誤與待上傳要顯眼，其餘不用', () => {
        expect(isSyncAttention(status({ phase: 'error' }))).toBe(true)
        expect(isSyncAttention(status({ phase: 'pending', pendingCount: 2 }))).toBe(true)
        expect(isSyncAttention(status({ phase: 'idle' }))).toBe(false)
        expect(isSyncAttention(status({ phase: 'syncing' }))).toBe(false)
    })
})
