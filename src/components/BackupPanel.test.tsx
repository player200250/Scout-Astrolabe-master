// @vitest-environment jsdom
// src/components/BackupPanel.test.tsx
//
// P0 修復 3（UI）：還原失敗時要明確告訴使用者，不能看起來像成功。
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { db, type BackupRecord } from '../db'
import { onAppEvent, type AppEventPayloads } from '../utils/appEvents'
import { BackupPanel } from './BackupPanel'

const backup: BackupRecord = {
    id: 'backup_1', timestamp: Date.now(), boardCount: 1,
    boards: [{ id: 'b1', name: '備份裡的板', snapshot: null, thumbnail: null, updatedAt: 0 }],
}

beforeEach(async () => {
    await db.table('backups').clear()
    await db.table('backups').put(backup)
})
afterEach(cleanup)

async function confirmRestore(onRestore: (b: unknown) => Promise<void>) {
    render(<BackupPanel sidebarWidth={0} onClose={() => {}} onRestore={onRestore} />)
    fireEvent.click(await screen.findByText('還原'))
    fireEvent.click(await screen.findByText('確認還原'))
}

describe('BackupPanel — 還原結果要讓使用者知道', () => {
    it('還原失敗 ⇒ 顯示錯誤提示（說明資料沒被更動），按鈕回到可再按的狀態', async () => {
        const toasts: AppEventPayloads['ui-toast'][] = []
        const off = onAppEvent('ui-toast', d => { toasts.push(d) })
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})

        await confirmRestore(async () => { throw new Error('QuotaExceededError') })

        await waitFor(() => expect(toasts).toHaveLength(1))
        expect(toasts[0].kind).toBe('error')
        expect(toasts[0].message).toContain('沒有被更動')
        expect(await screen.findByText('還原')).toBeTruthy()   // 不會卡在「還原中…」
        off(); err.mockRestore()
    })

    it('還原成功 ⇒ 不顯示錯誤，且有等還原完成', async () => {
        const toasts: unknown[] = []
        const off = onAppEvent('ui-toast', d => { toasts.push(d) })
        const onRestore = vi.fn(async () => {})

        await confirmRestore(onRestore)

        await waitFor(() => expect(onRestore).toHaveBeenCalledWith(backup.boards))
        expect(toasts).toHaveLength(0)
        off()
    })
})
