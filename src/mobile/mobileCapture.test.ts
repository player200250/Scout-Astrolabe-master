// @vitest-environment jsdom
// src/mobile/mobileCapture.test.ts
//
// 手機速記最重要的性質只有一個：**打完字按送出，那段文字不能弄丟**。
// 所以這裡測的重點全繞著「送不出去的時候會怎樣」轉——那才是人在外面的常態。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BoardRecord } from '../db'
import { INBOX_BOARD_ID } from '../constants'

const h = vi.hoisted(() => ({
    pullBoard: vi.fn(async (_id: string) => ({ ok: true, data: null }) as { ok: boolean; data: BoardRecord | null; error?: string }),
    pushBoard: vi.fn(async (_b: BoardRecord) => ({ ok: true }) as { ok: boolean; error?: string }),
}))

vi.mock('../sync/boardSync', () => ({ pullBoard: h.pullBoard, pushBoard: h.pushBoard }))

import { enqueueNote, flushOutbox, loadOutbox } from './mobileCapture'
import { getCardShapes } from '../utils/snapshot'

const inboxWith = (updatedAt: number, snapshot: BoardRecord['snapshot'] = null): BoardRecord => ({
    id: INBOX_BOARD_ID, name: '📥 收件匣', snapshot, thumbnail: null, updatedAt, isInbox: true,
})

beforeEach(() => {
    localStorage.clear()
    h.pullBoard.mockClear(); h.pullBoard.mockImplementation(async () => ({ ok: true, data: null }))
    h.pushBoard.mockClear(); h.pushBoard.mockImplementation(async () => ({ ok: true }))
})

describe('outbox', () => {
    it('速記先落地在本機，完全不碰網路', () => {
        enqueueNote('買牛奶')
        expect(loadOutbox().map(n => n.text)).toEqual(['買牛奶'])
        expect(h.pushBoard).not.toHaveBeenCalled()
    })

    it('前後空白會被清掉', () => {
        enqueueNote('  有空白  ')
        expect(loadOutbox()[0].text).toBe('有空白')
    })

    it('壞掉的 localStorage 內容不會讓 App 掛掉', () => {
        localStorage.setItem('astrolabe-mobile-outbox', '{壞的')
        expect(loadOutbox()).toEqual([])
    })
})

describe('flushOutbox', () => {
    it('沒東西可送時直接回成功、不打 API', async () => {
        const res = await flushOutbox()
        expect(res).toEqual({ ok: true, sent: 0, remaining: 0 })
        expect(h.pullBoard).not.toHaveBeenCalled()
    })

    it('送出後 outbox 清空，卡片進了收件匣的 snapshot', async () => {
        enqueueNote('第一則')
        enqueueNote('第二則')
        const res = await flushOutbox()

        expect(res.ok).toBe(true)
        expect(res.sent).toBe(2)
        expect(loadOutbox()).toEqual([])

        const pushed = h.pushBoard.mock.calls[0][0]
        expect(pushed.id).toBe(INBOX_BOARD_ID)
        const texts = getCardShapes(pushed.snapshot!).map(s => s.props?.text)
        expect(texts).toEqual(['第一則', '第二則'])
    })

    // 這條是整板 last-write-wins 的關鍵：一定要拿雲端最新的來追加，
    // 不然桌機這段期間加進收件匣的卡會被手機整批蓋掉。
    it('會先拉雲端最新版再追加，既有卡片不會被蓋掉', async () => {
        const existing = inboxWith(1000)
        // 先用一次 flush 造出一塊「已經有一張卡」的雲端收件匣
        enqueueNote('桌機記的')
        await flushOutbox()
        existing.snapshot = h.pushBoard.mock.calls[0][0].snapshot
        h.pushBoard.mockClear()

        h.pullBoard.mockImplementation(async () => ({ ok: true, data: existing }))
        enqueueNote('手機記的')
        await flushOutbox()

        expect(h.pullBoard).toHaveBeenCalledWith(INBOX_BOARD_ID)
        const texts = getCardShapes(h.pushBoard.mock.calls[0][0].snapshot!).map(s => s.props?.text)
        expect(texts).toEqual(['桌機記的', '手機記的'])
    })

    it('雲端還沒有收件匣時就地建一塊（id 與桌機同一個常數）', async () => {
        h.pullBoard.mockImplementation(async () => ({ ok: true, data: null }))
        enqueueNote('第一次同步')
        await flushOutbox()

        const pushed = h.pushBoard.mock.calls[0][0]
        expect(pushed.id).toBe(INBOX_BOARD_ID)
        expect(pushed.isInbox).toBe(true)
        expect(pushed.updatedAt).toBeGreaterThan(0)
    })

    it('推送失敗時速記留在 outbox（不會消失）', async () => {
        h.pushBoard.mockImplementation(async () => ({ ok: false, error: '連不上' }))
        enqueueNote('沒訊號時記的')
        const res = await flushOutbox()

        expect(res.ok).toBe(false)
        expect(res.remaining).toBe(1)
        expect(loadOutbox().map(n => n.text)).toEqual(['沒訊號時記的'])
    })

    it('拉取失敗時也不會清掉 outbox', async () => {
        h.pullBoard.mockImplementation(async () => ({ ok: false, data: null, error: '離線' }))
        enqueueNote('離線記的')
        const res = await flushOutbox()

        expect(res.ok).toBe(false)
        expect(loadOutbox()).toHaveLength(1)
        expect(h.pushBoard).not.toHaveBeenCalled()
    })

    it('失敗後恢復連線再送，之前累積的會一次全部送出', async () => {
        h.pushBoard.mockImplementation(async () => ({ ok: false, error: '離線' }))
        enqueueNote('第一則'); await flushOutbox()
        enqueueNote('第二則'); await flushOutbox()
        expect(loadOutbox()).toHaveLength(2)

        h.pushBoard.mockImplementation(async () => ({ ok: true }))
        const res = await flushOutbox()

        expect(res.sent).toBe(2)
        expect(loadOutbox()).toEqual([])
        const texts = getCardShapes(h.pushBoard.mock.calls.at(-1)![0].snapshot!).map(s => s.props?.text)
        expect(texts).toEqual(['第一則', '第二則'])
    })
})
