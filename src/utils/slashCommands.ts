// src/utils/slashCommands.ts
//
// 文字卡片的 `/` 選單（階段 1）——比照 Notion／Heptabase 的 slash command。
//
// 這一階段刻意「只露出已經能用的東西」，不新增任何格式：
// StarterKit 早就支援引用／分隔線／H3–H6／刪除線／行內程式碼，連 Markdown 輸入規則
// （`## `、`> `、`- `、`--- `）都是通的——但工具列只有 9 個按鈕，這些全都沒有入口。
// 所以問題從來不是「缺功能」，是「看不見」。（同一個病灶另見 BoardTabBar 的 isStale 🕐）
//
// 結構刻意與 utils/commands.ts（N1 命令面板）一致：純資料 registry ＋ 注入式 apply，
// 過濾直接複用 commands.ts 的 filterCommands（泛型，支援中英別名與多詞 AND）。

import type { Editor } from '@tiptap/react'

export type SlashGroup = '基本' | '清單' | '區塊' | '格式' | '顏色' | '連結'

export interface SlashRange {
    from: number
    to: number
}

export interface SlashCommand {
    id: string
    title: string
    icon: string
    group: SlashGroup
    /** 額外搜尋詞（中英別名），讓 `/h1`、`/quote`、`/引用` 都命中 */
    keywords?: string
    /** 顯示用的 Markdown 提示，順便教使用者不用選單也能打出來 */
    hint?: string
    /** 套用命令；range 為 `/query` 本身，套用前需先刪掉 */
    apply: (editor: Editor, range: SlashRange) => void
}

/** 文字顏色（與工具列的 6 色圓點同一組，見 TextContent.tsx 的 COLORS） */
export const SLASH_COLORS: { name: string; hex: string }[] = [
    { name: '預設', hex: '#1a1a1a' },
    { name: '紅', hex: '#e03131' },
    { name: '綠', hex: '#2f9e44' },
    { name: '藍', hex: '#1971c2' },
    { name: '橙', hex: '#f08c00' },
    { name: '紫', hex: '#7048e8' },
]

/** 先刪掉使用者打的 `/query`，再跑實際命令——所有 apply 的共同前綴 */
const at = (editor: Editor, range: SlashRange) =>
    editor.chain().focus().deleteRange(range)

export function buildSlashCommands(): SlashCommand[] {
    return [
        // 基本
        // keywords 一律含 Notion 式縮寫（h1/ul/ol/hr/code…）——那是使用者的肌肉記憶，
        // 而 filterCommands 只搜 title+keywords，不搜 icon。
        { id: 'paragraph', title: '文字', icon: '¶', group: '基本', keywords: 'text paragraph p 內文 段落', apply: (e, r) => at(e, r).setParagraph().run() },
        { id: 'h1', title: '標題 1', icon: 'H1', group: '基本', keywords: 'h1 heading1 heading title 標題 大標', hint: '# ', apply: (e, r) => at(e, r).toggleHeading({ level: 1 }).run() },
        { id: 'h2', title: '標題 2', icon: 'H2', group: '基本', keywords: 'h2 heading2 heading title 標題 中標', hint: '## ', apply: (e, r) => at(e, r).toggleHeading({ level: 2 }).run() },
        { id: 'h3', title: '標題 3', icon: 'H3', group: '基本', keywords: 'h3 heading3 heading title 標題 小標', hint: '### ', apply: (e, r) => at(e, r).toggleHeading({ level: 3 }).run() },

        // 清單
        { id: 'bullet-list', title: '條列清單', icon: '•', group: '清單', keywords: 'ul bullet list unordered 項目 清單 列表', hint: '- ', apply: (e, r) => at(e, r).toggleBulletList().run() },
        { id: 'ordered-list', title: '編號清單', icon: '1.', group: '清單', keywords: 'ol ordered numbered list 數字 編號 列表', hint: '1. ', apply: (e, r) => at(e, r).toggleOrderedList().run() },

        // 區塊
        { id: 'blockquote', title: '引用', icon: '❝', group: '區塊', keywords: 'quote blockquote 引言 引用', hint: '> ', apply: (e, r) => at(e, r).toggleBlockquote().run() },
        { id: 'code-block', title: '程式碼區塊', icon: '</>', group: '區塊', keywords: 'code codeblock block 程式 語法高亮', hint: '``` ', apply: (e, r) => at(e, r).toggleCodeBlock().run() },
        { id: 'divider', title: '分隔線', icon: '—', group: '區塊', keywords: 'hr divider horizontal rule line 分隔 水平線', hint: '--- ', apply: (e, r) => at(e, r).setHorizontalRule().run() },
        { id: 'callout', title: '提示框', icon: '💡', group: '區塊', keywords: 'callout note info admonition 提示 標註 重點框', apply: (e, r) => at(e, r).toggleCallout().run() },
        { id: 'toggle', title: '摺疊區塊', icon: '▸', group: '區塊', keywords: 'toggle details collapse fold 摺疊 折疊 收合 展開', apply: (e, r) => at(e, r).setToggle().run() },
        { id: 'math', title: '數學式', icon: '∑', group: '區塊', keywords: 'math latex equation formula katex 數學 公式 方程式', apply: (e, r) => at(e, r).setMathBlock().run() },

        // 格式
        { id: 'bold', title: '粗體', icon: 'B', group: '格式', keywords: 'b bold strong 粗', hint: 'Ctrl+B', apply: (e, r) => at(e, r).toggleBold().run() },
        { id: 'italic', title: '斜體', icon: 'I', group: '格式', keywords: 'i italic em 斜', hint: 'Ctrl+I', apply: (e, r) => at(e, r).toggleItalic().run() },
        { id: 'underline', title: '底線', icon: 'U', group: '格式', keywords: 'u underline 底線', hint: 'Ctrl+U', apply: (e, r) => at(e, r).toggleUnderline().run() },
        { id: 'strike', title: '刪除線', icon: 'S', group: '格式', keywords: 's strike strikethrough del 刪除線', apply: (e, r) => at(e, r).toggleStrike().run() },
        { id: 'highlight', title: '螢光筆', icon: '🖍', group: '格式', keywords: 'highlight mark 螢光筆 標記 醒目', apply: (e, r) => at(e, r).toggleHighlight().run() },
        { id: 'inline-code', title: '行內程式碼', icon: '`', group: '格式', keywords: 'code inline 行內 程式', apply: (e, r) => at(e, r).toggleCode().run() },

        // 顏色
        ...SLASH_COLORS.map(c => ({
            id: `color-${c.hex}`,
            title: `文字顏色：${c.name}`,
            icon: '●',
            group: '顏色' as const,
            keywords: `color 顏色 ${c.name}`,
            apply: (e: Editor, r: SlashRange) => at(e, r).setColor(c.hex).run(),
        })),

        // 連結
        {
            id: 'wikilink',
            title: '卡片連結',
            icon: '🔗',
            group: '連結',
            keywords: 'link wikilink 連結 卡片 backlink',
            hint: '[[',
            // 插入 `[[` 即觸發既有的卡片名自動補全（見 TextContent 的 SuggestState），不另做一套
            apply: (e, r) => at(e, r).insertContent('[[').run(),
        },
    ]
}

/**
 * 從游標前的文字判斷是否要開 `/` 選單，回傳 query 與 `/query` 的起點。
 *
 * 規則：`/` 必須在行首或空白之後（否則 `http://`、`a/b` 這種都會誤觸），
 * 且其後不得再有空白或斜線。`[[` 補全優先——兩者同時成立時讓給 wiki 連結。
 */
export function matchSlashQuery(textBefore: string): { query: string; length: number } | null {
    if (/\[\[([^\]]*)$/.test(textBefore)) return null   // [[ 補全優先
    const m = textBefore.match(/(?:^|\s)\/([^\s/]*)$/)
    if (!m) return null
    return { query: m[1], length: m[1].length + 1 }     // +1 ＝ 斜線本身
}

/** 依 group 分組並保持 registry 原順序（供選單顯示分組標題） */
export function groupSlashCommands(commands: SlashCommand[]): { group: SlashGroup; items: SlashCommand[] }[] {
    const out: { group: SlashGroup; items: SlashCommand[] }[] = []
    for (const c of commands) {
        const last = out[out.length - 1]
        if (last && last.group === c.group) last.items.push(c)
        else out.push({ group: c.group, items: [c] })
    }
    return out
}
