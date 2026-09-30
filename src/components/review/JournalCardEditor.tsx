// src/components/JournalCardEditor.tsx
//
// 日記／週回顧卡的內嵌編輯器：工具列 ＋ tiptap ＋ 900ms debounce 自動存檔。
// 日記與週回顧是同一種卡，只差 journalDate 的格式（'2026-09-20' vs 'week-2026-38'），
// 所以存檔走的是同一支 onSaveJournal。
//
// ⚠️ 版面：外層 minHeight:0 不可省。flex column 的子項預設 min-height:auto，
//    少了它 flex:1 不會縮到小於內容高度，捲動就會外溢到祖先——這正是 RC1 的成因。
//
// 編輯器本體（擴充組合＋工具列）與文字卡片共用，見 extensions/richText.ts 的說明。
// 今日日記（JournalDayView）也用這支，只在外面多一排日期導覽。
// `/` 選單與 `[[` 補全也與文字卡片共用（EditorMenus.tsx）。

import { useState, useEffect, useRef, useMemo } from 'react'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import { richTextExtensions } from '../card-shape/extensions/richText'
import { RichTextToolbar } from '../card-shape/sub-components/RichTextToolbar'
import { useEditorMenus } from '../card-shape/sub-components/EditorMenus'
import { extractCardName } from '../../hooks/useBacklinks'
import { buildLinkTargets } from '../../utils/cardLinks'
import { getSnapshotStore } from '../../utils/snapshot'
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

    // `[[` 補全的候選：白板名＋卡片名。白板裡用的是 BacklinksContext 的增量索引，
    // 但復盤中心不在那個 Provider 底下，所以這裡由 boards 直接算（只在 boards 變動時重算）。
    const linkTargets = useMemo(() => {
        const cardNames: string[] = []
        for (const b of boards) {
            if (!b.snapshot) continue
            for (const shape of Object.values(getSnapshotStore(b.snapshot))) {
                if (shape.typeName !== 'shape' || shape.type !== 'card') continue
                if (shape.props?.type !== 'text' && shape.props?.type !== 'journal') continue
                const name = extractCardName(shape.props?.text ?? '')
                if (name) cardNames.push(name)
            }
        }
        return buildLinkTargets(boards.filter(b => !b.isHome).map(b => b.name), cardNames)
    }, [boards])
    const menuKeyRef = useRef<(e: KeyboardEvent) => boolean>(() => false)

    const tiptap = useTiptap({
        extensions: richTextExtensions('開始寫…，或按 / 選擇格式'),
        content: card?.text ?? template,
        editorProps: {
            attributes: { style: 'outline:none' },
            // 回傳 true ＝ 攔下，PM 不再跑預設行為（原因見 EditorMenus.tsx 開頭）
            handleKeyDown: (_view, event) => menuKeyRef.current(event),
        },
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

    const menuPopups = useEditorMenus(tiptap, true, linkTargets, menuKeyRef)

    const statusColor = saveStatus === 'pending' ? '#f59e0b' : saveStatus === 'saving' ? '#aaa' : '#22c55e'
    const statusText  = saveStatus === 'pending' ? '未儲存' : saveStatus === 'saving' ? '儲存中…' : '已儲存'

    // 工具列與內文同寬置中：原本工具列貼齊最左、內文在正中間，寬螢幕上兩者對不起來
    const column: React.CSSProperties = { maxWidth, margin: maxWidth ? '0 auto' : undefined, width: '100%' }

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderBottom: `1px solid ${T.borderLight}`, background: T.bgApp, padding: '0 28px', flexShrink: 0 }}>
                <RichTextToolbar
                    tiptap={tiptap}
                    style={{ ...column, borderBottom: 'none', borderRadius: 0, padding: '4px 0', background: 'transparent' }}
                    trailing={saveStatus !== 'none' && <span style={{ fontSize: 11, color: statusColor }}>{statusText}</span>}
                />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
                <style>{`
                    .jce .ProseMirror { outline: none; color: ${T.textPrimary}; }
                    .jce .ProseMirror h2 { font-size: 18px; font-weight: 700; margin: 14px 0 6px; color: ${T.textPrimary}; }
                    .jce .ProseMirror p { margin: 4px 0; line-height: 1.8; }
                    .jce .ProseMirror ul, .jce .ProseMirror ol { padding-left: 20px; margin: 4px 0; }
                    .jce .ProseMirror li { margin: 2px 0; line-height: 1.7; }
                    .jce .ProseMirror strong { font-weight: 700; }
                `}</style>
                <div className="jce" style={{ ...column, fontSize: 15, color: T.textPrimary }}>
                    <EditorContent editor={tiptap} />
                </div>
            </div>
            {menuPopups}
        </div>
    )
}
