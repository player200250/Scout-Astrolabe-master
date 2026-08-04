// @vitest-environment jsdom
// src/mobile/mobileCards.test.ts
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { toMobileCard, readBoardCards, splitCardText, summarizeCards } from './mobileCards'
import { plainTextToHtml } from '../utils/snapshotPatch'

const card = (id: string, props: Record<string, unknown>, x = 0, y = 0) => ({ id, x, y, props })

function snap(shapes: { id: string; x: number; y: number; props: Record<string, unknown> }[]): TLEditorSnapshot {
    const store: Record<string, unknown> = {
        'page:page': { typeName: 'page', id: 'page:page', name: 'Page 1' },
    }
    for (const s of shapes) {
        store[s.id] = { typeName: 'shape', id: s.id, type: 'card', x: s.x, y: s.y, props: s.props }
    }
    return { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot
}

describe('splitCardText', () => {
    // ⚠️ 這條是第一版寫錯被測試抓到的地方：stripHtml 會把區塊元素之間壓成一個
    // 空格，所以「剝完再切第一行」永遠切不出標題（<h2>標題</h2><p>內文</p>
    // 剝完是「標題 內文」一整行）。必須在剝掉 HTML **之前**先看 H1/H2。
    it('有 H1/H2 時用它當標題，其餘是內文', () => {
        expect(splitCardText('<h2>標題</h2><p>內文</p>')).toEqual({ title: '標題', body: '內文' })
    })

    it('沒有標題標籤時退成第一行當標題（速記卡就是純文字）', () => {
        expect(splitCardText('第一行\n第二行')).toEqual({ title: '第一行', body: '第二行' })
    })

    it('純文字單行時 body 為空', () => {
        expect(splitCardText('只有這行')).toEqual({ title: '只有這行', body: '' })
    })

    it('全空回兩個空字串', () => {
        expect(splitCardText('   \n  ')).toEqual({ title: '', body: '' })
    })

    // ⚠️⚠️ 這兩條守的是一次真實的資料損毀（2026-08-04）：`splitTitleBody` 預設把
    // 內文截到 200 字（卡片庫預覽用），而手機把這個 body 當成編輯草稿的原文，
    // 於是在手機上編輯一次就把 8/3 日記 200 字以後的內容永久刪掉了。
    // body 在這一層一律要全文，要截是 UI 的事。
    it('內文超過 200 字也不截斷（有標題的路徑）', () => {
        const long = 'あ'.repeat(500)
        expect(splitCardText(`<h2>標題</h2><p>${long}</p>`).body).toBe(long)
    })

    it('內文超過 200 字也不截斷（純文字路徑）', () => {
        const long = 'あ'.repeat(500)
        expect(splitCardText(`第一行\n${long}`).body).toBe(long)
    })

    // 存檔寫出來的是「一行一個 <p>、中間沒有 \n」。若這裡只按 \n 切，整篇就會被
    // 當成一行 ⇒ 全部變標題、body 空的。切行必須認得區塊邊界。
    it('多個 <p> 算多行，不是一整行', () => {
        expect(splitCardText('<p>標題行</p><p>第二段</p><p>第三段</p>'))
            .toEqual({ title: '標題行', body: '第二段\n第三段' })
    })

    it('有 H2 時底下的段落也保留分行', () => {
        expect(splitCardText('<h2>標題</h2><p>一</p><p>二</p>'))
            .toEqual({ title: '標題', body: '一\n二' })
    })
})

describe('toMobileCard', () => {
    it('文字卡：HTML 會被剝掉', () => {
        const c = toMobileCard(card('shape:a', { type: 'text', text: '<h2>標題</h2><p>內文</p>' }))
        expect(c.type).toBe('text')
        expect(c.title).toBe('標題')
        expect(c.body).toContain('內文')
    })

    it('待辦卡：只留有文字的項目，勾選狀態與到期日保留', () => {
        const c = toMobileCard(card('shape:t', {
            type: 'todo',
            todos: [
                { id: 't1', text: '做完的', checked: true, dueDate: '2026-08-10' },
                { id: 't2', text: '沒做的', checked: false },
                { id: 't3', text: '', checked: false },      // 空項目不該出現在手機上
                { text: '沒有 id 的舊資料', checked: false }, // 沒有 id 就無法安全定位 ⇒ 不顯示
            ],
        }))
        expect(c.todos).toEqual([
            { id: 't1', text: '做完的', checked: true, dueDate: '2026-08-10' },
            { id: 't2', text: '沒做的', checked: false, dueDate: null },
        ])
    })

    // 各型別的「標題」來源不同，硬套第一行的話這幾種會整列空白
    it('連結卡沒有文字時用 title，再沒有就用網址', () => {
        expect(toMobileCard(card('shape:l', { type: 'link', url: 'https://x.dev', title: '網頁標題' })).title).toBe('網頁標題')
        expect(toMobileCard(card('shape:l2', { type: 'link', url: 'https://x.dev' })).title).toBe('https://x.dev')
    })

    it('檔案卡用原始檔名當標題', () => {
        const c = toMobileCard(card('shape:f', { type: 'file', originalName: '報告.pdf' }))
        expect(c.title).toBe('報告.pdf')
        expect(c.fileName).toBe('報告.pdf')
    })

    it('認不得的型別退成 unknown 而不是整張卡消失', () => {
        expect(toMobileCard(card('shape:x', { type: '未來的新型別' })).type).toBe('unknown')
    })

    it('tags 只收字串（壞資料不會讓畫面炸掉）', () => {
        const c = toMobileCard(card('shape:g', { type: 'text', text: 'x', tags: ['ok', 42, null] }))
        expect(c.tags).toEqual(['ok'])
    })

    it('完全沒有 props 也不會丟例外', () => {
        const c = toMobileCard(card('shape:e', {}))
        expect(c.type).toBe('unknown')
        expect(c.title).toBe('')
        expect(c.todos).toEqual([])
    })
})

// 真正咬人的不是任何單一函式，是「顯示模型 → 編輯草稿 → 存回卡片」這條往返：
// 只要顯示模型丟掉了什麼，存回去就是永久刪除。這條測試才是能抓到 8/04 那次
// 資料損毀的那一條，所以刻意跨模組寫在這裡。
describe('編輯往返（顯示模型 → 草稿 → 存回）', () => {
    const roundTrip = (text: string) => {
        const c = toMobileCard(card('shape:j', { type: 'journal', text }))
        const draft = [c.title, c.body].filter(Boolean).join('\n')   // MobileBrowse.startEdit
        return plainTextToHtml(draft)                                 // 按下「儲存」寫回 props.text
    }

    it('幾百字的日記存回去之後內容還在', () => {
        const body = '今天做了什麼。'.repeat(60)   // 遠超過預覽用的 200 字上限
        const saved = roundTrip(`<h2>8/3（一）</h2><p>${body}</p>`)

        expect(saved).toContain(body)
        expect(toMobileCard(card('shape:j', { type: 'journal', text: saved })).body).toBe(body)
    })

    // 不穩定的往返一樣會慢慢吃掉東西：每編一次就少一點，使用者看不出是哪一次沒的
    it('編第二次、第三次都不再變動（往返是穩定的）', () => {
        const once = roundTrip('<h2>標題</h2><p>第一段</p><p>第二段</p><p>第三段</p>')
        expect(once).toBe('<p>標題</p><p>第一段</p><p>第二段</p><p>第三段</p>')
        expect(roundTrip(once)).toBe(once)
        expect(roundTrip(roundTrip(once))).toBe(once)
    })
})

describe('readBoardCards', () => {
    // 不排序的話手機上的順序會跟桌機看到的排版對不起來，同一塊板像兩塊板
    it('照畫布位置排序：先上下、再左右', () => {
        const s = snap([
            card('shape:c', { type: 'text', text: 'C' }, 10, 300),
            card('shape:b', { type: 'text', text: 'B' }, 400, 10),
            card('shape:a', { type: 'text', text: 'A' }, 10, 10),
        ])
        expect(readBoardCards(s).map(c => c.title)).toEqual(['A', 'B', 'C'])
    })

    // 同一「列」的卡片 y 常差幾 px，不容差的話會被拆成好幾列、左右順序就亂了
    it('y 相差在 40px 內視為同一列，依 x 排', () => {
        const s = snap([
            card('shape:r', { type: 'text', text: '右' }, 500, 30),
            card('shape:l', { type: 'text', text: '左' }, 100, 0),
        ])
        expect(readBoardCards(s).map(c => c.title)).toEqual(['左', '右'])
    })

    it('null snapshot 回空陣列', () => {
        expect(readBoardCards(null)).toEqual([])
    })
})

describe('summarizeCards', () => {
    it('空板直說', () => {
        expect(summarizeCards([])).toBe('空白板')
    })

    it('有未完成待辦時一併報出來', () => {
        const cards = readBoardCards(snap([
            card('shape:t', { type: 'todo', todos: [{ id: 'a', text: 'a', checked: false }, { id: 'b', text: 'b', checked: true }] }),
            card('shape:x', { type: 'text', text: 'hi' }),
        ]))
        expect(summarizeCards(cards)).toBe('2 張卡 · 1 項未完成')
    })

    it('全部完成時不顯示待辦數', () => {
        const cards = readBoardCards(snap([
            card('shape:t', { type: 'todo', todos: [{ id: 'a', text: 'a', checked: true }] }),
        ]))
        expect(summarizeCards(cards)).toBe('1 張卡')
    })
})
