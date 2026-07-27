// @vitest-environment jsdom
// src/mobile/mobileSyncCore.test.ts
//
// 這裡測的是手機速記真正送出去的那條路。重點全繞著「送不出去的時候會怎樣」轉——
// 那才是人在外面的常態，也是最容易寫錯又最傷的地方（速記憑空消失）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { INBOX_BOARD_ID } from '../constants'
import { getCardShapes } from '../utils/snapshot'
import type { OutboxNote, StoredAuth } from './mobileStore'

const h = vi.hoisted(() => ({
    getOutbox: vi.fn(async () => [] as OutboxNote[]),
    removeNotes: vi.fn(async (_ids: string[]) => {}),
    loadAuth: vi.fn(async () => null as StoredAuth | null),
    saveAuth: vi.fn(async (_a: StoredAuth) => {}),
    saveLastSyncedAt: vi.fn(async (_at: number) => {}),
}))

vi.mock('./mobileStore', () => h)

import { flushOutboxCore } from './mobileSyncCore'

const AUTH: StoredAuth = {
    url: 'https://proj.supabase.co',
    anonKey: 'anon-key-value',
    userId: 'user-1',
    accessToken: 'token-old',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3600_000,
}

const note = (id: string, text: string): OutboxNote => ({ id, text, createdAt: Date.now() })

/** 依序回應的 fetch 假替身 */
function mockFetch(responses: { status: number; body?: unknown }[]) {
    const calls: { url: string; init?: RequestInit }[] = []
    let i = 0
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        const r = responses[Math.min(i++, responses.length - 1)]
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body ?? {},
        } as Response
    })
    vi.stubGlobal('fetch', fn)
    return calls
}

const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}'))

beforeEach(() => {
    vi.unstubAllGlobals()
    h.getOutbox.mockReset(); h.getOutbox.mockResolvedValue([])
    h.removeNotes.mockReset(); h.removeNotes.mockResolvedValue(undefined)
    h.loadAuth.mockReset(); h.loadAuth.mockResolvedValue(AUTH)
    h.saveAuth.mockReset(); h.saveAuth.mockResolvedValue(undefined)
    h.saveLastSyncedAt.mockReset(); h.saveLastSyncedAt.mockResolvedValue(undefined)
})

describe('flushOutboxCore — 正常路徑', () => {
    it('沒東西可送時不打任何 API', async () => {
        const calls = mockFetch([{ status: 200, body: [] }])
        const res = await flushOutboxCore()

        expect(res).toEqual({ ok: true, sent: 0, remaining: 0 })
        expect(calls).toHaveLength(0)
    })

    it('先拉雲端收件匣，再把速記追加上去推回', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', '第一則'), note('n2', '第二則')])
        h.getOutbox.mockResolvedValue([])   // 送完之後 outbox 空了
        const calls = mockFetch([
            { status: 200, body: [{ id: INBOX_BOARD_ID, name: '📥 收件匣', snapshot: null, updated_at: 1, is_inbox: true }] },
            { status: 201 },
        ])

        const res = await flushOutboxCore()

        expect(res.ok).toBe(true)
        expect(res.sent).toBe(2)
        expect(res.inboxCardCount).toBe(2)
        expect(h.removeNotes).toHaveBeenCalledWith(['n1', 'n2'])

        const pushed = bodyOf(calls[1].init)
        expect(pushed.id).toBe(INBOX_BOARD_ID)
        expect(getCardShapes(pushed.snapshot).map(s => s.props?.text)).toEqual(['第一則', '第二則'])
    })

    // 整板 last-write-wins：必須拿雲端最新的來追加，
    // 否則桌機這段期間加進收件匣的卡會被手機整批蓋掉
    it('雲端既有的卡片不會被蓋掉', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', '手機記的')])
        const existing = {
            store: {
                'document:document': { typeName: 'document', id: 'document:document' },
                'page:page': { typeName: 'page', id: 'page:page', name: '', index: 'a1', meta: {} },
                'shape:qc_1': {
                    typeName: 'shape', id: 'shape:qc_1', type: 'card', x: 0, y: 0, rotation: 0,
                    index: 'a1', parentId: 'page:page', isLocked: false, opacity: 1, meta: {},
                    props: { type: 'text', text: '桌機記的', w: 240, h: 180 },
                },
            },
            schema: {},
        }
        const calls = mockFetch([
            { status: 200, body: [{ id: INBOX_BOARD_ID, name: '收件匣', snapshot: { document: existing }, updated_at: 1, is_inbox: true }] },
            { status: 201 },
        ])

        await flushOutboxCore()

        const pushed = bodyOf(calls[1].init)
        expect(getCardShapes(pushed.snapshot).map(s => s.props?.text)).toEqual(['桌機記的', '手機記的'])
    })

    it('雲端還沒有收件匣時就地建一塊（id 與桌機同一個常數）', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', '第一次同步')])
        const calls = mockFetch([{ status: 200, body: [] }, { status: 201 }])

        await flushOutboxCore()

        const pushed = bodyOf(calls[1].init)
        expect(pushed.id).toBe(INBOX_BOARD_ID)
        expect(pushed.is_inbox).toBe(true)
        expect(pushed.name).toBe('📥 收件匣')
    })
})

describe('flushOutboxCore — 省流量', () => {
    // 手機從不顯示縮圖，而它常常比內容本身還大（桌機實測 8KB 內容配 57KB 縮圖）。
    // 在行動網路上，每記一則就來回搬一張用不到的圖是真的浪費。
    it('查詢時不要縮圖欄位', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', 'x')])
        const calls = mockFetch([{ status: 200, body: [] }, { status: 201 }])

        await flushOutboxCore()

        expect(calls[0].url).toContain('select=')
        expect(calls[0].url).not.toContain('thumbnail')
    })

    // upsert 語意下，沒送的欄位在更新既有列時保持雲端現值——
    // 所以桌機產生的縮圖不會被手機清成 null
    it('推回去時 payload 不含 thumbnail', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', 'x')])
        const calls = mockFetch([{ status: 200, body: [] }, { status: 201 }])

        await flushOutboxCore()

        expect(bodyOf(calls[1].init)).not.toHaveProperty('thumbnail')
    })
})

describe('flushOutboxCore — 失敗時速記不會消失', () => {
    it('拉取失敗就整輪放棄，outbox 原封不動', async () => {
        h.getOutbox.mockResolvedValue([note('n1', '離線記的')])
        mockFetch([{ status: 500, body: { message: '伺服器炸了' } }])

        const res = await flushOutboxCore()

        expect(res.ok).toBe(false)
        expect(res.remaining).toBe(1)
        expect(h.removeNotes).not.toHaveBeenCalled()
    })

    it('推送失敗時 outbox 原封不動', async () => {
        h.getOutbox.mockResolvedValue([note('n1', '沒訊號時記的')])
        mockFetch([{ status: 200, body: [] }, { status: 500, body: { message: '寫入失敗' } }])

        const res = await flushOutboxCore()

        expect(res.ok).toBe(false)
        expect(h.removeNotes).not.toHaveBeenCalled()
    })

    it('網路整個斷掉（fetch 直接 throw）也不會掉東西', async () => {
        h.getOutbox.mockResolvedValue([note('n1', '斷網')])
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

        const res = await flushOutboxCore()

        expect(res.ok).toBe(false)
        expect(res.error).toContain('連不上網路')
        expect(h.removeNotes).not.toHaveBeenCalled()
    })

    it('沒有憑證時直接回「尚未登入」', async () => {
        h.getOutbox.mockResolvedValue([note('n1', 'x')])
        h.loadAuth.mockResolvedValue(null)
        const calls = mockFetch([{ status: 200, body: [] }])

        const res = await flushOutboxCore()

        expect(res.error).toBe('尚未登入')
        expect(calls).toHaveLength(0)
    })
})

describe('flushOutboxCore — token 換新', () => {
    // 背景同步常常在 access token 過期之後才觸發（有效期約一小時），
    // 「離線一晚、早上恢復連線」是最典型的情境
    it('token 快到期時先換新的再打 API', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', 'x')])
        h.loadAuth.mockResolvedValue({ ...AUTH, expiresAt: Date.now() + 5_000 })
        const calls = mockFetch([
            { status: 200, body: { access_token: 'token-new', refresh_token: 'refresh-2', expires_in: 3600, user: { id: 'user-1' } } },
            { status: 200, body: [] },
            { status: 201 },
        ])

        const res = await flushOutboxCore()

        expect(calls[0].url).toContain('grant_type=refresh_token')
        expect(h.saveAuth).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'token-new' }))
        // 之後的請求要用新 token
        expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer token-new')
        expect(res.ok).toBe(true)
    })

    it('拉取撞到 401 會換 token 再試一次', async () => {
        h.getOutbox.mockResolvedValueOnce([note('n1', 'x')])
        const calls = mockFetch([
            { status: 401 },
            { status: 200, body: { access_token: 'token-new', refresh_token: 'refresh-2', expires_in: 3600 } },
            { status: 200, body: [] },
            { status: 201 },
        ])

        const res = await flushOutboxCore()

        expect(res.ok).toBe(true)
        expect(calls[1].url).toContain('grant_type=refresh_token')
    })

    it('refresh token 也失效時回明確訊息、不丟東西', async () => {
        h.getOutbox.mockResolvedValue([note('n1', 'x')])
        mockFetch([{ status: 401 }, { status: 400, body: { error: 'invalid_grant' } }])

        const res = await flushOutboxCore()

        expect(res.ok).toBe(false)
        expect(res.error).toContain('請重新登入')
        expect(h.removeNotes).not.toHaveBeenCalled()
    })
})
