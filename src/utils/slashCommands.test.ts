// src/utils/slashCommands.test.ts
import { describe, it, expect, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import { buildSlashCommands, matchSlashQuery, groupSlashCommands, SLASH_COLORS } from './slashCommands'
import { filterCommands } from './commands'

describe('buildSlashCommands', () => {
    it('id 唯一', () => {
        const ids = buildSlashCommands().map(c => c.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('每個命令有 title/icon/group/apply', () => {
        for (const c of buildSlashCommands()) {
            expect(c.title).toBeTruthy()
            expect(c.icon).toBeTruthy()
            expect(c.group).toBeTruthy()
            expect(typeof c.apply).toBe('function')
        }
    })

    it('包含 6 個顏色命令', () => {
        const colors = buildSlashCommands().filter(c => c.id.startsWith('color-'))
        expect(colors).toHaveLength(SLASH_COLORS.length)
    })
})

describe('matchSlashQuery', () => {
    it('行首的斜線觸發，query 為空', () => {
        expect(matchSlashQuery('/')).toEqual({ query: '', length: 1 })
    })

    it('取斜線後的 query，length 含斜線本身', () => {
        expect(matchSlashQuery('/h1')).toEqual({ query: 'h1', length: 3 })
        expect(matchSlashQuery('前面有字 /引用')).toEqual({ query: '引用', length: 3 })
    })

    it('空白之後的斜線可觸發（Heptabase 行為：段落中間也能開）', () => {
        expect(matchSlashQuery('hello /quo')).toEqual({ query: 'quo', length: 4 })
    })

    it('緊貼文字的斜線不觸發（避免 a/b 誤觸）', () => {
        expect(matchSlashQuery('a/b')).toBeNull()
        expect(matchSlashQuery('http://')).toBeNull()
        expect(matchSlashQuery('https://example')).toBeNull()
    })

    it('query 內出現空白即結束（打完字接空白就不再是選單）', () => {
        expect(matchSlashQuery('/quote ')).toBeNull()
    })

    it('第二個斜線不觸發（避免路徑誤觸）', () => {
        expect(matchSlashQuery('/a/b')).toBeNull()
    })

    it('[[ 補全優先，不搶 wiki 連結', () => {
        expect(matchSlashQuery('[[卡片/名')).toBeNull()
        expect(matchSlashQuery('[[')).toBeNull()
    })

    it('沒有斜線時回傳 null', () => {
        expect(matchSlashQuery('一般文字')).toBeNull()
        expect(matchSlashQuery('')).toBeNull()
    })
})

describe('filterCommands 複用於 slash 選單', () => {
    const cmds = buildSlashCommands()

    it('空 query 回傳全部', () => {
        expect(filterCommands(cmds, '')).toHaveLength(cmds.length)
    })

    it('中文命中', () => {
        expect(filterCommands(cmds, '引用').map(c => c.id)).toContain('blockquote')
    })

    it('英文別名命中', () => {
        expect(filterCommands(cmds, 'quote').map(c => c.id)).toContain('blockquote')
        expect(filterCommands(cmds, 'divider').map(c => c.id)).toContain('divider')
    })

    // Notion 肌肉記憶：使用者會直接打 /h1、/ul、/hr，不會打「標題 1」
    it.each([
        ['h1', 'h1'], ['h2', 'h2'], ['h3', 'h3'],
        ['ul', 'bullet-list'], ['ol', 'ordered-list'],
        ['hr', 'divider'], ['code', 'code-block'],
    ])('Notion 式縮寫 /%s 命中 %s', (query, id) => {
        expect(filterCommands(cmds, query).map(c => c.id)).toContain(id)
    })

    it('查無命令時為空', () => {
        expect(filterCommands(cmds, 'zzz不存在')).toHaveLength(0)
    })
})

describe('groupSlashCommands', () => {
    it('依 group 分組且保持 registry 原順序', () => {
        const groups = groupSlashCommands(buildSlashCommands())
        expect(groups.map(g => g.group)).toEqual(['基本', '清單', '區塊', '格式', '顏色', '連結'])
        expect(groups[0].items[0].id).toBe('paragraph')
    })

    it('空清單回傳空陣列', () => {
        expect(groupSlashCommands([])).toEqual([])
    })

    it('過濾後仍能正確分組（只剩命中的組）', () => {
        const filtered = filterCommands(buildSlashCommands(), '標題')
        const groups = groupSlashCommands(filtered)
        expect(groups.map(g => g.group)).toEqual(['基本'])
    })
})

describe('apply', () => {
    /** 假的 tiptap chain：記錄呼叫了哪些指令 */
    const makeEditor = () => {
        const calls: string[] = []
        const chain: Record<string, unknown> = {}
        for (const m of ['focus', 'deleteRange', 'setParagraph', 'toggleHeading', 'toggleBulletList',
            'toggleOrderedList', 'toggleBlockquote', 'toggleCodeBlock', 'setHorizontalRule',
            'toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrike', 'toggleCode',
            'toggleHighlight', 'toggleCallout', 'setToggle', 'setMathBlock', 'setColor', 'insertContent']) {
            chain[m] = vi.fn((...args: unknown[]) => { calls.push(args.length ? `${m}:${JSON.stringify(args[0])}` : m); return chain })
        }
        chain.run = vi.fn(() => true)
        return { editor: { chain: () => chain } as unknown as Editor, calls }
    }

    it('每個命令都先 focus 並刪掉 /query 範圍，最後 run', () => {
        for (const c of buildSlashCommands()) {
            const { editor, calls } = makeEditor()
            c.apply(editor, { from: 5, to: 8 })
            expect(calls[0]).toBe('focus')
            expect(calls[1]).toBe('deleteRange:{"from":5,"to":8}')
        }
    })

    it('引用套用 toggleBlockquote', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'blockquote')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('toggleBlockquote')
    })

    it('標題 3 帶 level 3', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'h3')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('toggleHeading:{"level":3}')
    })

    it('顏色命令帶對應色碼', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'color-#e03131')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('setColor:"#e03131"')
    })

    it('卡片連結插入 [[ 以觸發既有補全', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'wikilink')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('insertContent:"[["')
    })

    it('螢光筆套用 toggleHighlight', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'highlight')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('toggleHighlight')
    })

    it('提示框套用 toggleCallout', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'callout')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('toggleCallout')
    })

    it('摺疊區塊套用 setToggle', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'toggle')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('setToggle')
    })

    it('數學式套用 setMathBlock', () => {
        const { editor, calls } = makeEditor()
        buildSlashCommands().find(c => c.id === 'math')!.apply(editor, { from: 0, to: 1 })
        expect(calls).toContain('setMathBlock')
    })
})
