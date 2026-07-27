// @vitest-environment jsdom
// src/mobile/mobileCapture.test.ts
//
// 這個檔案專測**互斥**。flush 有三個觸發點（開啟 App、恢復連線、按下送出），
// 沒有鎖的話兩輪會各自拉同一份雲端收件匣、各自追加後推上去：後推的蓋掉先推的，
// 而且若前一輪已清掉 outbox，後一輪會把同一則再追加一次＝雲端出現重複卡片。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { OutboxNote } from './mobileStore'
import type { FlushResult } from './mobileSyncCore'

const h = vi.hoisted(() => ({
    outbox: [] as OutboxNote[],
    getOutbox: vi.fn(async () => h.outbox),
    addNote: vi.fn(async (n: OutboxNote) => { h.outbox = [...h.outbox, n] }),
    saveAuth: vi.fn(async () => {}),
    clearAuth: vi.fn(async () => {}),
    migrateLegacyOutbox: vi.fn(async () => 0),
    loadLastSyncedAt: vi.fn(async () => null),
    flushOutboxCore: vi.fn(async () => ({ ok: true, sent: 0, remaining: 0 }) as FlushResult),
}))

vi.mock('./mobileStore', () => ({
    getOutbox: h.getOutbox,
    addNote: h.addNote,
    saveAuth: h.saveAuth,
    clearAuth: h.clearAuth,
    migrateLegacyOutbox: h.migrateLegacyOutbox,
    loadLastSyncedAt: h.loadLastSyncedAt,
}))
vi.mock('./mobileSyncCore', () => ({ flushOutboxCore: h.flushOutboxCore }))

import { enqueueNote, flushOutbox } from './mobileCapture'

const deferred = <T>() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>(r => { resolve = r })
    return { promise, resolve }
}

beforeEach(() => {
    h.outbox = []
    h.getOutbox.mockClear()
    h.addNote.mockClear()
    h.flushOutboxCore.mockReset()
    h.flushOutboxCore.mockResolvedValue({ ok: true, sent: 0, remaining: 0 })
})

describe('enqueueNote', () => {
    it('速記先落地在本機，完全不碰網路', async () => {
        await enqueueNote('買牛奶')
        expect(h.outbox.map(n => n.text)).toEqual(['買牛奶'])
        expect(h.flushOutboxCore).not.toHaveBeenCalled()
    })

    it('前後空白會被清掉', async () => {
        await enqueueNote('  有空白  ')
        expect(h.outbox[0].text).toBe('有空白')
    })

    it('每則都有自己的 id（同一毫秒內連打兩則也不會撞）', async () => {
        await enqueueNote('a')
        await enqueueNote('b')
        expect(h.outbox[0].id).not.toBe(h.outbox[1].id)
    })
})

describe('flushOutbox — 互斥', () => {
    it('同時呼叫兩次只會真的跑一輪', async () => {
        const d = deferred<FlushResult>()
        h.flushOutboxCore.mockReturnValue(d.promise)

        const a = flushOutbox()
        const b = flushOutbox()
        expect(h.flushOutboxCore).toHaveBeenCalledTimes(1)

        d.resolve({ ok: true, sent: 1, remaining: 0 })
        expect(await a).toEqual(await b)
        expect(h.flushOutboxCore).toHaveBeenCalledTimes(1)
    })

    // 使用者在補送進行中又按了送出：那一則不在前一輪讀到的清單裡，
    // 必須補跑一輪，否則它會卡在 outbox 直到下一次觸發
    it('前一輪跑到一半才加進來的速記會被補送', async () => {
        const d = deferred<FlushResult>()
        h.flushOutboxCore.mockReturnValueOnce(d.promise)
        h.flushOutboxCore.mockResolvedValue({ ok: true, sent: 1, remaining: 0 })

        const first = flushOutbox()
        await enqueueNote('跑到一半才按的')     // 進了 outbox
        const second = flushOutbox()

        d.resolve({ ok: true, sent: 1, remaining: 0 })
        await first
        await second

        expect(h.flushOutboxCore).toHaveBeenCalledTimes(2)
    })

    it('上一輪失敗時不連環重試（等下次觸發即可）', async () => {
        const d = deferred<FlushResult>()
        h.flushOutboxCore.mockReturnValueOnce(d.promise)

        const first = flushOutbox()
        await enqueueNote('離線時記的')
        const second = flushOutbox()

        d.resolve({ ok: false, sent: 0, remaining: 1, error: '連不上網路' })
        await first
        const res = await second

        expect(h.flushOutboxCore).toHaveBeenCalledTimes(1)
        expect(res.ok).toBe(false)
    })

    it('鎖在上一輪結束後會釋放（下一次呼叫照常執行）', async () => {
        await flushOutbox()
        await flushOutbox()
        expect(h.flushOutboxCore).toHaveBeenCalledTimes(2)
    })

    it('核心丟例外時鎖也要釋放，不能從此卡死', async () => {
        h.flushOutboxCore.mockRejectedValueOnce(new Error('炸了'))
        await expect(flushOutbox()).rejects.toThrow('炸了')

        h.flushOutboxCore.mockResolvedValue({ ok: true, sent: 0, remaining: 0 })
        await expect(flushOutbox()).resolves.toEqual({ ok: true, sent: 0, remaining: 0 })
    })
})
