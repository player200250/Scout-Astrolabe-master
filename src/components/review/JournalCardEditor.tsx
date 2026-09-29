// src/components/JournalCardEditor.tsx
//
// 日記／週回顧卡的內嵌編輯器：工具列 ＋ tiptap ＋ 900ms debounce 自動存檔。
// 日記與週回顧是同一種卡，只差 journalDate 的格式（'2026-09-20' vs 'week-2026-38'），
// 所以存檔走的是同一支 onSaveJournal。
//
// ⚠️ 版面：外層 minHeight:0 不可省。flex column 的子項預設 min-height:auto，
//    少了它 flex:1 不會縮到小於內容高度，捲動就會外溢到祖先——這正是 RC1 的成因。
//
// TODO(下一輪)：JournalDayView 的編輯器與這支是同一套邏輯（它多一排日期導覽），
//    RC1 才剛修完、這輪不動它；等週回顧這邊穩定後再把 JournalDayView 併過來。

import { useState, useEffect, useRef } from 'react'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import type { BoardRecord } from '../../db'
import { findJournalCard, isUntouchedTemplate } from '../../utils/journalCards'
import { SAVE_STATUS_RESET_MS } from '../../constants'
import { T } from '../../theme/tokens'

interface JournalCardEditorProps {
    boards: BoardRecord[]
    /** 要編輯哪張卡：journalDate 的值。日記 '2026-09-20'，週回顧 'week-2026-38' */
    dateKey: string
    /** 卡片還不存在時，編輯器帶入的預設內容 */
    template: string
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    /** 內文欄寬上限；不給就吃滿容器 */
    maxWidth?: number
    /**
     * 外部寫入這張卡之後把它 +1，編輯器才會把新內容讀回來。
     * setContent 只在 dateKey 變動時跑，不加這個的話「一鍵記為沒有產出」寫進 IndexedDB 了，
     * 畫面上還是舊的空模板。
     */
    syncToken?: number
}

export function JournalCardEditor({ boards, dateKey, template, onSaveJournal, maxWidth, syncToken = 0 }: JournalCardEditorProps) {
    const card = findJournalCard(boards, dateKey)
    const journalBoardId = boards.find(b => b.isJournal)?.id ?? null

    // RC4：'none' ＝「這一天／這一週還沒有卡片」。少了它，初值一律是 'saved'，
    // 於是還沒寫過的日子一打開就顯示綠色「已儲存」，而月曆右欄同時寫著「尚無日記」。
    // 'none' 時狀態列整個不顯示——什麼都還沒發生，就不該報告任何狀態。
    const [saveStatus, setSaveStatus] = useState<'none' | 'saved' | 'saving' | 'pending'>(() => (card ? 'saved' : 'none'))
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // 掛載當下與切換 dateKey 時 setContent 會觸發 onUpdate，那不是使用者編輯，不能當成待存
    const skipUpdate = useRef(true)

    const cardRef = useRef(card)
    const keyRef = useRef(dateKey)
    const boardIdRef = useRef(journalBoardId)
    const templateRef = useRef(template)
    cardRef.current = card
    keyRef.current = dateKey
    boardIdRef.current = journalBoardId
    templateRef.current = template

    const tiptap = useTiptap({
        extensions: [StarterKit, Underline, TextStyle, Color],
        content: card?.text ?? template,
        editorProps: { attributes: { style: 'outline:none' } },
        onUpdate: ({ editor }) => {
            if (skipUpdate.current) return
            setSaveStatus('pending')
            if (saveTimer.current) clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(() => {
                const c = cardRef.current
                const html = editor.getHTML()
                // RC9：debounce 存的是「900ms 之後」的文件狀態，不是觸發當下。
                // 打了字又在同一個視窗內刪掉，這裡拿到的就是原封不動的模板——
                // 存下去只會生出一張「只有標題、一個字沒填」的空殼卡（實測確認，見 bugs.md RC9）。
                // 卡片已經存在就照常存：使用者可能是刻意清空。
                if (!c && isUntouchedTemplate(html, templateRef.current)) { setSaveStatus('none'); return }
                setSaveStatus('saving')
                onSaveJournal(c?.boardId ?? boardIdRef.current ?? '', keyRef.current, html, c?.shapeId ?? null)
                setTimeout(() => setSaveStatus('saved'), SAVE_STATUS_RESET_MS)
            }, 900)
        },
    })

    useEffect(() => {
        skipUpdate.current = true
        const c = cardRef.current
        tiptap?.commands.setContent(c?.text ?? template, false)
        setSaveStatus(c ? 'saved' : 'none')
        const t = setTimeout(() => { skipUpdate.current = false }, 120)
        return () => clearTimeout(t)
        // template 刻意不進 deps：它只在卡片不存在時當初值，跟著 dateKey 一起換就夠了
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateKey, tiptap, syncToken])

    useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

    const statusColor = saveStatus === 'pending' ? '#f59e0b' : saveStatus === 'saving' ? '#aaa' : '#22c55e'
    const statusText  = saveStatus === 'pending' ? '未儲存' : saveStatus === 'saving' ? '儲存中…' : '已儲存'

    const buttons = tiptap ? [
        { cmd: () => tiptap.chain().focus().toggleBold().run(),                            active: tiptap.isActive('bold'),                  label: 'B',  style: { fontWeight: 700 } },
        { cmd: () => tiptap.chain().focus().toggleItalic().run(),                          active: tiptap.isActive('italic'),                label: 'I',  style: { fontStyle: 'italic' as const } },
        { cmd: () => tiptap.chain().focus().toggleUnderline().run(),                       active: tiptap.isActive('underline'),             label: 'U',  style: { textDecoration: 'underline' } },
        { cmd: () => tiptap.chain().focus().toggleHeading({ level: 2 }).run(),             active: tiptap.isActive('heading', { level: 2 }), label: 'H2', style: { fontSize: 11 } },
        { cmd: () => tiptap.chain().focus().toggleBulletList().run(),                      active: tiptap.isActive('bulletList'),            label: '•≡', style: {} },
    ] : []

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 2, padding: '4px 16px',
                borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0, background: T.bgApp,
            }}>
                {buttons.map(btn => (
                    <button
                        key={btn.label}
                        onMouseDown={e => { e.preventDefault(); btn.cmd() }}
                        style={{
                            padding: '2px 7px', fontSize: 12, border: 'none', borderRadius: 5, cursor: 'pointer',
                            background: btn.active ? T.accentBg : 'transparent',
                            color: btn.active ? T.accent : T.textSecondary,
                            ...btn.style,
                        }}
                    >{btn.label}</button>
                ))}
                <div style={{ flex: 1 }} />
                {saveStatus !== 'none' && <span style={{ fontSize: 11, color: statusColor }}>{statusText}</span>}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
                <style>{`
                    .jce .ProseMirror { outline: none; color: ${T.textPrimary}; }
                    .jce .ProseMirror h2 { font-size: 17px; font-weight: 700; margin: 14px 0 6px; color: ${T.textPrimary}; }
                    .jce .ProseMirror p { margin: 4px 0; line-height: 1.8; }
                    .jce .ProseMirror ul { padding-left: 20px; margin: 4px 0; }
                    .jce .ProseMirror li { margin: 2px 0; line-height: 1.7; }
                    .jce .ProseMirror strong { font-weight: 700; }
                `}</style>
                <div className="jce" style={{ maxWidth, margin: maxWidth ? '0 auto' : undefined, fontSize: 14.5, color: T.textPrimary }}>
                    <EditorContent editor={tiptap} />
                </div>
            </div>
        </div>
    )
}
