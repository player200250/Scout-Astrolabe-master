// @vitest-environment jsdom
// src/SearchPanel.test.ts
//
// 這個檔案存在的直接理由：舊版 buildSearchIndex 只索引 5 種卡片型別，
// 其餘 6 種（heading／sticky／table／color／board／file）被 `continue` 跳過＝**根本搜不到**。
// 那種 bug 不會報錯、不會當機，只會讓人覺得「我明明記過這件事」，然後怪自己記錯。
import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { buildCardSearchText, buildSearchIndex, searchFromIndex, typeCountsFor, buildSnippet } from './SearchPanel'

const boardNames = new Map([['b_target', '被連到的白板']])

const text = (props: Parameters<typeof buildCardSearchText>[0]) =>
    buildCardSearchText(props, boardNames)

describe('buildCardSearchText — 每種卡片型別都要搜得到', () => {
    it('text：HTML 被剝掉只留純文字', () => {
        const r = text({ type: 'text', text: '<p>買<strong>咖啡豆</strong></p>' })
        expect(r.content).toBe('買咖啡豆')
        expect(r.preview).toBe('買咖啡豆')
    })

    it('heading', () => {
        expect(text({ type: 'heading', text: '2026 年度規劃' }).content).toBe('2026 年度規劃')
    })

    // 便利貼是使用者用得最兇的型別之一，卻是舊版漏掉的六種之一
    it('sticky：換行會被收成空白', () => {
        const r = text({ type: 'sticky', text: '踩到的坑\n\nProject URL 貼錯會 404' })
        expect(r.content).toBe('踩到的坑 project url 貼錯會 404')
    })

    it('todo：標題與每一項待辦都可搜，預覽帶勾選狀態', () => {
        const r = text({
            type: 'todo', text: '本週',
            todos: [{ text: '寫測試', checked: true }, { text: '修 bug', checked: false }],
        })
        expect(r.content).toContain('寫測試')
        expect(r.content).toContain('修 bug')
        expect(r.preview).toContain('✅ 寫測試')
        expect(r.preview).toContain('☐ 修 bug')
    })

    it('link：網址、標題、內文都可搜', () => {
        const r = text({ type: 'link', url: 'https://tldraw.dev', title: 'tldraw 官網', text: '畫布引擎' })
        expect(r.content).toContain('tldraw.dev')
        expect(r.content).toContain('畫布引擎')
        expect(r.preview).toBe('tldraw 官網')
    })

    it('table：每一格內容都可搜', () => {
        const r = text({ type: 'table', tableData: [
            { cells: [{ content: '方案' }, { content: '成本' }] },
            { cells: [{ content: 'GitHub Pages' }, { content: '免費' }] },
        ] })
        expect(r.content).toContain('github pages')
        expect(r.content).toContain('免費')
    })

    it('color：色票名稱與色碼都可搜（「我那個 #3b82f6 放哪」是真的會發生的搜尋）', () => {
        const r = text({ type: 'color', swatches: [{ name: '主色', hex: '#3b82f6' }] })
        expect(r.content).toContain('主色')
        expect(r.content).toContain('#3b82f6')
    })

    it('file：檔名可搜', () => {
        const r = text({ type: 'file', originalName: '合約草案.pdf', fileExt: 'pdf' })
        expect(r.content).toContain('合約草案.pdf')
        expect(r.preview).toBe('合約草案.pdf')
    })

    // board 卡自己沒有文字，要靠 linkedBoardId 反查白板名稱
    it('board：用被連到的白板名稱來搜', () => {
        const r = text({ type: 'board', linkedBoardId: 'b_target' })
        expect(r.content).toBe('被連到的白板')
        expect(r.preview).toBe('→ 被連到的白板')
    })

    it('board：連到已刪除的白板時不會炸，只是沒有可搜文字', () => {
        expect(text({ type: 'board', linkedBoardId: 'gone' }).content).toBe('')
    })

    it('未知型別至少保留文字（不像舊版整張卡消失）', () => {
        expect(text({ type: 'future-type', text: '還是找得到我' }).content).toBe('還是找得到我')
    })

    it('標籤對所有型別都可搜', () => {
        expect(text({ type: 'sticky', text: '內容', tags: ['閱讀', '待辦'] }).content).toContain('閱讀')
        expect(text({ type: 'table', tableData: [], tags: ['報表'] }).content).toContain('報表')
    })

    it('content 一律 lowercase（搜尋時只做一次 includes）', () => {
        expect(text({ type: 'text', text: 'GitHub Pages' }).content).toBe('github pages')
    })

    it('預覽保留全文——截斷改到顯示層做，否則取不到關鍵字附近的片段', () => {
        expect(text({ type: 'text', text: 'あ'.repeat(200) }).preview).toHaveLength(200)
    })
})

// ── 索引與搜尋 ───────────────────────────────────────────────────────────────

const card = (id: string, props: Record<string, unknown>) => ({
    id, typeName: 'shape', type: 'card', x: 10, y: 20, props,
})

const board = (id: string, name: string, cards: ReturnType<typeof card>[]) => ({
    id, name, thumbnail: null, updatedAt: 1,
    snapshot: { document: { store: Object.fromEntries(cards.map(c => [c.id, c])) } } as unknown as TLEditorSnapshot,
})

describe('buildSearchIndex', () => {
    it('六種舊版搜不到的型別，現在都進得了索引', () => {
        const index = buildSearchIndex([board('b1', '板', [
            card('s1', { type: 'heading', text: '標題卡' }),
            card('s2', { type: 'sticky', text: '便利貼卡' }),
            card('s3', { type: 'table', tableData: [{ cells: [{ content: '表格卡' }] }] }),
            card('s4', { type: 'color', swatches: [{ name: '色票卡', hex: '#fff' }] }),
            card('s5', { type: 'file', originalName: '檔案卡.pdf' }),
            card('s6', { type: 'board', linkedBoardId: 'b1' }),
        ])])
        expect(index.map(e => e.type).sort())
            .toEqual(['board', 'color', 'file', 'heading', 'sticky', 'table'])
    })

    it('完全沒有可搜文字的卡不進索引（否則型別計數會看起來不對）', () => {
        const index = buildSearchIndex([board('b1', '板', [
            card('s1', { type: 'color', swatches: [] }),
            card('s2', { type: 'text', text: '有內容' }),
        ])])
        expect(index).toHaveLength(1)
    })

    it('同一塊板的同一個 shape 只會進索引一次', () => {
        const b = board('b1', '板', [card('s1', { type: 'text', text: 'x' })])
        expect(buildSearchIndex([b, b])).toHaveLength(1)
    })

    it('非卡片的 shape 與空 snapshot 都會被略過', () => {
        expect(buildSearchIndex([
            { id: 'b0', name: '空板', snapshot: null, thumbnail: null, updatedAt: 1 },
        ])).toEqual([])
    })
})

describe('searchFromIndex — 型別篩選（B3）', () => {
    const index = buildSearchIndex([board('b1', '板', [
        card('s1', { type: 'text', text: '同步筆記' }),
        card('s2', { type: 'sticky', text: '同步的坑' }),
        card('s3', { type: 'todo', text: '同步', todos: [{ text: '寫文件' }] }),
    ])])

    it('不指定型別時全部命中', () => {
        expect(searchFromIndex(index, '同步').total).toBe(3)
    })

    it('指定型別只回該型別', () => {
        const { results, total } = searchFromIndex(index, '同步', 'sticky')
        expect(total).toBe(1)
        expect(results[0].type).toBe('sticky')
    })

    it('關鍵字空白時不搜（避免把整個索引倒出來）', () => {
        expect(searchFromIndex(index, '   ').total).toBe(0)
    })

    it('大小寫不敏感', () => {
        const i = buildSearchIndex([board('b1', '板', [card('s1', { type: 'text', text: 'GitHub' })])])
        expect(searchFromIndex(i, 'github').total).toBe(1)
        expect(searchFromIndex(i, 'GITHUB').total).toBe(1)
    })
})

describe('typeCountsFor — 篩選列要顯示的型別與筆數', () => {
    const index = buildSearchIndex([board('b1', '板', [
        card('s1', { type: 'text', text: '同步 A' }),
        card('s2', { type: 'text', text: '同步 B' }),
        card('s3', { type: 'sticky', text: '同步 C' }),
        card('s4', { type: 'text', text: '無關' }),
    ])])

    it('只計入命中關鍵字的卡', () => {
        const counts = typeCountsFor(index, '同步')
        expect(counts.get('text')).toBe(2)
        expect(counts.get('sticky')).toBe(1)
    })

    // 列出永遠 0 筆的 chip 只會讓人以為篩選壞了
    it('沒命中的型別根本不出現', () => {
        expect(typeCountsFor(index, '同步').has('todo')).toBe(false)
    })

    it('沒有關鍵字時回空（篩選列不顯示）', () => {
        expect(typeCountsFor(index, '').size).toBe(0)
    })
})

// ── 命中片段（KWIC）───────────────────────────────────────────────────────────
//
// 結果列原本一律顯示「卡片開頭 80 字」：關鍵字出現在第 200 字的卡，畫面上完全
// 看不到命中的地方，也就無法判斷這筆該不該點進去。這裡釘住「窗口以命中為中心」
// 與「命中處要標出來」兩件事。

const plain = (parts: ReturnType<typeof buildSnippet>) => parts.map(p => p.text).join('')
const hits = (parts: ReturnType<typeof buildSnippet>) => parts.filter(p => p.hit).map(p => p.text)

describe('buildSnippet', () => {
    it('關鍵字在開頭時不加前置省略號', () => {
        const parts = buildSnippet('同步引擎的設計', '同步')
        expect(parts[0]).toEqual({ text: '同步', hit: true })
        expect(plain(parts)).toBe('同步引擎的設計')
    })

    it('關鍵字埋在長文中間 → 窗口以它為中心，兩側都有省略號', () => {
        const src = `${'前'.repeat(200)}關鍵字${'後'.repeat(200)}`
        const parts = buildSnippet(src, '關鍵字', 30)
        expect(parts[0].text).toBe('…')
        expect(parts[parts.length - 1].text).toBe('…')
        expect(hits(parts)).toEqual(['關鍵字'])
        // 命中前後都要看得到上下文，不是只把關鍵字貼在邊上
        const idx = parts.findIndex(p => p.hit)
        expect(parts[idx - 1].text).toMatch(/前+/)
        expect(parts[idx + 1].text).toMatch(/後+/)
    })

    it('窗口內每一次命中都標，不是只標第一個', () => {
        expect(hits(buildSnippet('同步、再同步、還是同步', '同步'))).toEqual(['同步', '同步', '同步'])
    })

    it('大小寫不同也算命中，且保留原文的大小寫', () => {
        const parts = buildSnippet('用 Supabase 做同步', 'supabase')
        expect(hits(parts)).toEqual(['Supabase'])
    })

    it('關鍵字不在預覽裡時退回開頭片段（命中的可能是標籤或 URL）', () => {
        const parts = buildSnippet('這張卡的內容完全沒提到那個詞', '標籤名')
        expect(hits(parts)).toEqual([])
        expect(plain(parts)).toBe('這張卡的內容完全沒提到那個詞')
    })

    it('沒有關鍵字時就是單純截斷', () => {
        const parts = buildSnippet('あ'.repeat(200), '', 90)
        expect(parts).toHaveLength(1)
        expect(parts[0].text).toHaveLength(91) // 90 + 省略號
    })

    it('空預覽回空陣列（UI 顯示「(無內容)」）', () => {
        expect(buildSnippet('', '同步')).toEqual([])
        expect(buildSnippet('   ', '同步')).toEqual([])
    })

    it('命中靠近尾端時窗口往前補，不會只剩幾個字', () => {
        const src = `${'前'.repeat(100)}尾端詞`
        const parts = buildSnippet(src, '尾端詞', 30)
        expect(plain(parts).replace(/…/g, '')).toHaveLength(30)
        expect(parts[parts.length - 1].hit).toBe(true) // 後面沒有東西了 → 不加尾省略號
    })
})
