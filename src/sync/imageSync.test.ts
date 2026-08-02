// src/sync/imageSync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'

vi.mock('./supabaseClient', () => ({
    getSupabase: vi.fn(),
    getCurrentUserId: vi.fn(async () => 'user-1'),
    describeNetworkError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))
vi.mock('../platform/imageStore', () => ({
    canSyncImages: vi.fn(() => true),
    hasImage: vi.fn(async () => false),
    readImageBytes: vi.fn(async () => new ArrayBuffer(8)),
    writeImageBytes: vi.fn(async () => true),
}))

import { collectImageNames, imageObjectPath, uploadImages, downloadMissingImages, describeStorageError, IMAGE_BUCKET } from './imageSync'
import { getSupabase } from './supabaseClient'
import { canSyncImages, hasImage, readImageBytes, writeImageBytes } from '../platform/imageStore'

/** 造一份只含指定卡片的 snapshot（形狀與 utils/snapshot 的 getCardShapes 相容） */
function snap(cards: { id: string; type: string; storedName?: string }[]): TLEditorSnapshot {
    const store: Record<string, unknown> = {}
    for (const c of cards) {
        store[c.id] = {
            typeName: 'shape', id: c.id, type: 'card',
            props: { type: c.type, storedName: c.storedName },
        }
    }
    return { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot
}

/** Storage API 的最小替身 */
function fakeStorage(over: { upload?: unknown; download?: unknown } = {}) {
    const upload = over.upload ?? vi.fn(async () => ({ error: null }))
    const download = over.download ?? vi.fn(async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null }))
    const from = vi.fn(() => ({ upload, download }))
    return { client: { storage: { from } }, from, upload, download }
}

beforeEach(() => {
    vi.mocked(canSyncImages).mockReturnValue(true)
    vi.mocked(hasImage).mockResolvedValue(false)
    vi.mocked(readImageBytes).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(writeImageBytes).mockResolvedValue(true)
})

describe('collectImageNames', () => {
    it('只撈 image 卡的 storedName', () => {
        const s = snap([
            { id: 'a', type: 'image', storedName: 'x.png' },
            { id: 'b', type: 'text' },
            // file 卡也有 storedName，但**刻意不同步**（大小無上限，見檔頭邊界 1）
            { id: 'c', type: 'file', storedName: 'big.zip' },
        ])
        expect(collectImageNames(s)).toEqual(['x.png'])
    })

    it('去重且保序', () => {
        const s = snap([
            { id: 'a', type: 'image', storedName: 'x.png' },
            { id: 'b', type: 'image', storedName: 'y.png' },
            { id: 'c', type: 'image', storedName: 'x.png' },
        ])
        expect(collectImageNames(s)).toEqual(['x.png', 'y.png'])
    })

    it('沒有 storedName 的 image 卡（舊的 base64 卡）不會混進來', () => {
        expect(collectImageNames(snap([{ id: 'a', type: 'image' }]))).toEqual([])
    })

    it('null snapshot 回空陣列', () => {
        expect(collectImageNames(null)).toEqual([])
    })
})

describe('imageObjectPath', () => {
    // 路徑第一層就是 RLS 的判斷依據（schema.sql 用 storage.foldername(name)[1] 比對 auth.uid()）
    it('前綴 userId', () => {
        expect(imageObjectPath('u1', 'abc.png')).toBe('u1/abc.png')
    })
})

describe('uploadImages', () => {
    it('上傳沒推過的圖，並回報成功的名字', async () => {
        const s = fakeStorage()
        vi.mocked(getSupabase).mockReturnValue(s.client as never)

        const r = await uploadImages(['a.png', 'b.png'], () => false)

        expect(r.uploaded).toEqual(['a.png', 'b.png'])
        expect(r.failures).toEqual([])
        expect(s.from).toHaveBeenCalledWith(IMAGE_BUCKET)
        expect(s.upload).toHaveBeenCalledTimes(2)
    })

    it('已經推過的圖不會再上傳一次', async () => {
        const s = fakeStorage()
        vi.mocked(getSupabase).mockReturnValue(s.client as never)

        const r = await uploadImages(['a.png', 'b.png'], name => name === 'a.png')

        expect(r.uploaded).toEqual(['b.png'])
        expect(s.upload).toHaveBeenCalledTimes(1)
    })

    // 這條是刻意的設計：本機檔案不見了（手動刪過 userData/files、舊備份還原）不算失敗。
    // 記成失敗的話，那塊板會因為一張永遠回不來的圖而再也推不上雲。
    it('本機讀不到檔時記成已上傳而不是失敗', async () => {
        const s = fakeStorage()
        vi.mocked(getSupabase).mockReturnValue(s.client as never)
        vi.mocked(readImageBytes).mockResolvedValue(null)

        const r = await uploadImages(['gone.png'], () => false)

        expect(r.failures).toEqual([])
        expect(r.uploaded).toEqual(['gone.png'])
        expect(s.upload).not.toHaveBeenCalled()
    })

    it('上傳失敗會列進 failures 且不記成已上傳', async () => {
        const s = fakeStorage({ upload: vi.fn(async () => ({ error: { message: '沒有權限' } })) })
        vi.mocked(getSupabase).mockReturnValue(s.client as never)

        const r = await uploadImages(['a.png'], () => false)

        expect(r.uploaded).toEqual([])
        expect(r.failures).toEqual([{ storedName: 'a.png', error: '沒有權限' }])
    })

    it('平台不支援圖片同步（PWA）時整個是 no-op', async () => {
        const s = fakeStorage()
        vi.mocked(getSupabase).mockReturnValue(s.client as never)
        vi.mocked(canSyncImages).mockReturnValue(false)

        const r = await uploadImages(['a.png'], () => false)

        expect(r.uploaded).toEqual([])
        expect(s.from).not.toHaveBeenCalled()
    })
})

describe('downloadMissingImages', () => {
    it('本機已經有的圖不會重新下載', async () => {
        const s = fakeStorage()
        vi.mocked(getSupabase).mockReturnValue(s.client as never)
        vi.mocked(hasImage).mockResolvedValue(true)

        const r = await downloadMissingImages(['a.png'])

        expect(r.transferred).toBe(0)
        expect(s.download).not.toHaveBeenCalled()
    })

    it('缺的圖會下載並以原本的 storedName 寫回本機', async () => {
        const s = fakeStorage()
        vi.mocked(getSupabase).mockReturnValue(s.client as never)

        const r = await downloadMissingImages(['a.png'])

        expect(r.transferred).toBe(1)
        expect(s.download).toHaveBeenCalledWith('user-1/a.png')
        // ⚠️ 名字必須原樣傳給 writeImageBytes：改了名 snapshot 的參照就對不上
        expect(writeImageBytes).toHaveBeenCalledWith('a.png', expect.any(ArrayBuffer))
    })

    it('下載失敗只列進 failures，不丟例外（拉取階段不該被一張圖中斷）', async () => {
        const s = fakeStorage({ download: vi.fn(async () => ({ data: null, error: { message: '找不到物件' } })) })
        vi.mocked(getSupabase).mockReturnValue(s.client as never)

        const r = await downloadMissingImages(['a.png'])

        expect(r.transferred).toBe(0)
        expect(r.failures).toEqual([{ storedName: 'a.png', error: '找不到物件' }])
    })
})

describe('describeStorageError', () => {
    // bucket 是在 supabase/schema.sql 裡建的。升級 App 後沒重跑那份 SQL 時，
    // 每塊含圖的板都會推不上去，而原文只說「Bucket not found」——沒人猜得到下一步。
    it('Bucket not found 會指出要重跑 schema.sql', () => {
        expect(describeStorageError('Bucket not found')).toContain('schema.sql')
    })

    it('RLS 被擋時指向 storage 政策', () => {
        expect(describeStorageError('new row violates row-level security policy')).toContain('政策')
    })

    it('認不得的錯誤原樣回傳（不要吞掉線索）', () => {
        expect(describeStorageError('unexpected boom')).toBe('unexpected boom')
    })
})
