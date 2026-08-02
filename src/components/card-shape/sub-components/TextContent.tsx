import { useEffect, useCallback, useContext, useState, useMemo, useRef } from 'react'
import { type Editor as TldrawEditor, useIsDarkMode } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { CARD_COLORS } from '../type/CardShape'
import { openLink } from '../../../platform/linkOpener'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { Callout } from '../extensions/Callout'
import { ToggleBlock, ToggleSummary, ToggleContent } from '../extensions/Toggle'
import { MathBlock } from '../extensions/MathBlock'
import 'katex/dist/katex.min.css' // 全域 katex 樣式：編輯預覽與唯讀注入都靠它畫對
import { createLowlight, common } from 'lowlight'
import { BacklinksContext } from '../../../hooks/useBacklinks'
import { Z_MODAL } from '../../../constants'
import { emitAppEvent } from '../../../utils/appEvents'
import { buildSlashCommands, matchSlashQuery, groupSlashCommands, type SlashCommand } from '../../../utils/slashCommands'
import { filterCommands } from '../../../utils/commands'
import { buildLinkTargets, filterLinkTargets, groupLinkTargets, type LinkTarget } from '../../../utils/cardLinks'
import { T } from '../../../theme/tokens'
import { Icon } from '../../ui/icons'

// registry 是純資料、與元件無關 → 模組層建一次即可，不隨每次 render 重算
const SLASH_COMMANDS = buildSlashCommands()

// 方案 A（Toggle 自動貼合高度）用的常數
const TOGGLE_FIT_MAX_H = 800  // 上限；超過就裁切＋回到 fade/footer（雙擊編輯看全文）
const TOGGLE_FIT_MIN_H = 80   // 下限；收合到只剩標題時不要比這更矮
const TOGGLE_FIT_CHROME = 28  // 內容外的固定高度（padding-top + border + 底部留白）

// 建立 lowlight 實例（包含常用語言）
const lowlight = createLowlight(common)

interface TextContentProps {
    editor: TldrawEditor
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
    preventResize?: boolean  // Modal 模式下不改高度
}

/* ================================================
   工具列按鈕
================================================ */
const COLORS = ['#1a1a1a', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#7048e8']

function ToolbarButton({
    onClick,
    active,
    title,
    children,
    
}: {
    onClick: () => void
    active?: boolean
    title?: string
    children: React.ReactNode
    isDark?: boolean
}) {
    return (
        <button
            onMouseDown={(e) => {
                e.preventDefault()
                onClick()
            }}
            title={title}
            style={{
                padding: '3px 7px',
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                background: active ? (T.accentBg) : 'transparent',
                color: active ? '#60a5fa' : (T.textPrimary),
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 1.4,
            }}
        >
            {children}
        </button>
    )
}

function Toolbar({ tiptap, isDark }: { tiptap: ReturnType<typeof useTiptap>; isDark: boolean }) {
    if (!tiptap) return null

    return (
        <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 2,
                padding: '4px 8px',
                borderBottom: `1px solid ${T.borderLight}`,
                background: T.bgApp,
                borderRadius: '12px 12px 0 0',
                flexShrink: 0,
            }}
        >
            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleBold().run()}
                active={tiptap.isActive('bold')}
                title="粗體"
                isDark={isDark}
            >
                <b>B</b>
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleItalic().run()}
                active={tiptap.isActive('italic')}
                title="斜體"
                isDark={isDark}
            >
                <i>I</i>
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleUnderline().run()}
                active={tiptap.isActive('underline')}
                title="底線"
                isDark={isDark}
            >
                <u>U</u>
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHeading({ level: 1 }).run()}
                active={tiptap.isActive('heading', { level: 1 })}
                title="標題 1"
                isDark={isDark}
            >
                H1
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHeading({ level: 2 }).run()}
                active={tiptap.isActive('heading', { level: 2 })}
                title="標題 2"
                isDark={isDark}
            >
                H2
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleBulletList().run()}
                active={tiptap.isActive('bulletList')}
                title="條列清單"
                isDark={isDark}
            >
                ≡
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleOrderedList().run()}
                active={tiptap.isActive('orderedList')}
                title="數字清單"
                isDark={isDark}
            >
                1≡
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleCodeBlock().run()}
                active={tiptap.isActive('codeBlock')}
                title="程式碼區塊（語法高亮）"
                isDark={isDark}
            >
                {'</>'}
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHighlight().run()}
                active={tiptap.isActive('highlight')}
                title="螢光筆"
                isDark={isDark}
            >
                <mark style={{ background: '#fef08a', padding: '0 2px', borderRadius: 2 }}>H</mark>
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            {COLORS.map((color) => (
                <button
                    key={color}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        tiptap.chain().focus().setColor(color).run()
                    }}
                    title={color}
                    style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: color,
                        border: tiptap.isActive('textStyle', { color }) ? '2px solid #333' : '2px solid transparent',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                    }}
                />
            ))}
        </div>
    )
}

/* ================================================
   Wiki-link autocomplete helpers
================================================ */
interface SuggestState {
    query: string
    from: number
    coords: { x: number; y: number }
    index: number
    matches: LinkTarget[]
}

/* ================================================
   `/` 選單（階段 1）
   ——只露出 StarterKit 早就支援、但工具列沒給入口的東西（引用/分隔線/H3…）。
   命令 registry 與過濾在 utils/slashCommands.ts（純函式、有測試）。
================================================ */
interface SlashState {
    query: string
    from: number
    coords: { x: number; y: number }
    index: number
    matches: SlashCommand[]
}

/** 補全下拉的共用外殼（`[[]]` 與 `/` 兩處共用，避免複製一份定位/配色） */
function SuggestPopup({
    coords, footer, children,
}: {
    coords: { x: number; y: number }
    isDark: boolean
    footer: string
    children: React.ReactNode
}) {
    return (
        <div
            onPointerDown={(e) => e.preventDefault()}
            style={{
                position: 'fixed',
                left: coords.x,
                top: coords.y,
                zIndex: Z_MODAL,
                background: T.bgPanel,
                border: `1px solid ${T.borderLight}`,
                borderRadius: 8,
                boxShadow: T.shadowMd,
                minWidth: 180,
                maxWidth: 280,
                maxHeight: 320,
                overflowY: 'auto',
                fontSize: 13,
            }}
        >
            {children}
            <div style={{
                padding: '3px 12px', fontSize: 10,
                color: T.textMuted,
                borderTop: `1px solid ${T.borderLight}`,
                background: T.bgApp,
                position: 'sticky', bottom: 0,
            }}>
                {footer}
            </div>
        </div>
    )
}

/* ================================================
   TextContent 主組件
================================================ */
export function TextContent({ editor: tldrawEditor, shape, isEditing, exitEdit, preventResize = false }: TextContentProps) {
    const p = shape.props
    const cardBg = CARD_COLORS[p.color ?? 'none']?.bg ?? '#ffffff'
    const isDark = useIsDarkMode()
    // 方案 A：含 Toggle 的卡片，唯讀時依「當前展開/收合狀態」自動調整卡片高度（見下方 auto-fit effect）。
    const hasToggle = useMemo(() => !!p.text?.includes('toggle-block'), [p.text])
    const [toggleFitClipped, setToggleFitClipped] = useState(false)
    const { boardNames, cardIndex } = useContext(BacklinksContext)
    // 補全候選＝白板名＋卡片名（B-LINK 後 [[卡片名]] 才跳得動，故也該補得出來）。
    // cardIndex 來自 useBacklinks 的增量快取，不是每次 render 重掃。
    const linkTargets = useMemo(() => {
        const cardNames: string[] = []
        for (const targets of cardIndex.values()) {
            const t = targets[0]
            if (t) cardNames.push(t.name)
        }
        return buildLinkTargets(boardNames, cardNames)
    }, [boardNames, cardIndex])
    const [suggest, setSuggest] = useState<SuggestState | null>(null)
    const suggestRef = useRef<SuggestState | null>(null)
    suggestRef.current = suggest
    const [slash, setSlash] = useState<SlashState | null>(null)
    const slashRef = useRef<SlashState | null>(null)
    slashRef.current = slash
    // 兩個選單的鍵盤處理都必須走 ProseMirror 的 handleKeyDown，不能用 React 的 onKeyDown：
    // PM 的 listener 掛在 contenteditable 上（target 階段），React 是委派在 root（bubble 階段），
    // 所以 PM 會先把 Enter 變成 splitBlock transaction，等 React 收到時段落已經被切開了。
    // 用 ref 讓 useTiptap 的一次性 config 能讀到最新的 state 與 callback。
    const slashKeyRef = useRef<(e: KeyboardEvent) => boolean>(() => false)
    const suggestKeyRef = useRef<(e: KeyboardEvent) => boolean>(() => false)

    // Ref for the view-mode container — native capture-phase listener bypasses tldraw interception
    const viewContainerRef = useRef<HTMLDivElement>(null)

    // 方案 A：含 Toggle 的卡片，唯讀時依「當前展開/收合狀態」自動貼合卡片高度。
    // 用 ref 承載（每次 render 更新，讀得到最新 shape.props.h），讓下方 [isEditing, p.text] 的 effect
    // 能在不把 h 放進 deps 的情況下呼叫它——否則 resize 改了 h 就會讓 effect/listener 反覆重掛（實測會漏事件）。
    // ⚠️ ro.offsetHeight 是內容自然高度，不受父層 overflow:hidden 與 tldraw 縮放（transform）影響。
    const fitToggleHeightRef = useRef<() => void>(() => {})
    fitToggleHeightRef.current = () => {
        if (isEditing || !hasToggle) return
        const el = viewContainerRef.current
        if (!el) return
        const ro = el.querySelector('.tiptap-readonly') as HTMLElement | null
        if (!ro) return
        const natural = ro.offsetHeight + TOGGLE_FIT_CHROME
        setToggleFitClipped(natural > TOGGLE_FIT_MAX_H)
        const target = Math.max(TOGGLE_FIT_MIN_H, Math.min(natural, TOGGLE_FIT_MAX_H))
        if (Math.abs(target - shape.props.h) > 2) {
            tldrawEditor.updateShape({ id: shape.id, type: 'card', props: { h: target } })
        }
    }

    useEffect(() => {
        const el = viewContainerRef.current
        if (!el) return
        const handler = (e: PointerEvent) => {
            const target = e.target as HTMLElement
            // Notion 式分流：摺疊三角形 ▶（唯讀顯示層注入的 .toggle-caret）＝收合/展開的點擊目標，
            // 攔住 tldraw 的選取/拖曳（實際 toggle 在下方 click handler 手動做、寫回 p.text）。
            // summary 的「標題文字」區**不攔**——讓 pointer 事件冒泡給 tldraw，雙擊才進得了編輯模態
            // （文字卡編輯是 body 上的模態，見 CardShapeUtil 的 text-card-edit / showTextModal）。
            if (target.closest('[data-toggle-caret]')) {
                e.stopPropagation()
                return
            }
            // 卡片連結 [[X]] → 站內跳轉
            const encoded = (target.closest('[data-wikilink]') as HTMLElement | null)?.getAttribute('data-wikilink')
            if (encoded) {
                e.stopPropagation()
                e.preventDefault()
                emitAppEvent('jump-to-card', { targetName: decodeURIComponent(encoded) })
                return
            }
            // 外部超連結 <a href> → 用系統瀏覽器開啟（與 LinkContent 一致，走 openLink 這個 IPC）
            const href = (target.closest('a[href]') as HTMLAnchorElement | null)?.getAttribute('href')
            if (href) {
                e.stopPropagation()
                e.preventDefault()
                const url = href.startsWith('http') ? href : `https://${href}`
                openLink(url)
            }
        }
        el.addEventListener('pointerdown', handler, { capture: true })
        return () => el.removeEventListener('pointerdown', handler, { capture: true })
    // re-attach after switching back to view mode (ref re-mounts)
    }, [isEditing])

    // 方案 A：用 ResizeObserver 觀察唯讀內容（.tiptap-readonly）的尺寸——收合/展開讓
    // .details-content display 改變 → 內容自然高度改變 → RO 必觸發 → 貼合卡片高度。
    // 比監聽 'toggle' 事件穩：不依賴事件是否冒泡/listener 生命週期，任何造成內容變高變矮的原因都涵蓋。
    // 觀察對象是「自然高度」的內容元素，改卡片 h 不會回頭改它 → 不會無限迴圈。
    useEffect(() => {
        if (isEditing || !hasToggle) return
        const el = viewContainerRef.current
        if (!el) return
        const ro = el.querySelector('.tiptap-readonly') as HTMLElement | null
        if (!ro) return
        // ⚠️ 用 rAF 把「改卡片高度」移出 RO 的遞送週期：若在 RO callback 內同步改尺寸，
        // Chromium 會發「ResizeObserver loop completed with undelivered notifications」警告，
        // 而本專案的全域錯誤浮層（main.tsx）會把它當錯誤蓋滿全螢幕、擋住 summary 點擊
        // （實測收合失效的真正原因就是這個浮層攔截）。rAF 讓遞送先乾淨結束、下一幀才更新。
        let rafId = 0
        const obs = new ResizeObserver(() => {
            if (rafId) return
            rafId = requestAnimationFrame(() => { rafId = 0; fitToggleHeightRef.current() })
        })
        obs.observe(ro)
        return () => { if (rafId) cancelAnimationFrame(rafId); obs.disconnect() }
    }, [isEditing, hasToggle, p.text])

    // Notion 式 toggle 互動（唯讀）＝三角形收合／標題編輯分流，且收合狀態持久化到 p.text。
    // 不用原生 <details> 的點擊 toggle（會在 DOM 上改 open 卻不進 p.text＝與資料不同步），全手動控制：
    //   • 點三角形 .toggle-caret → preventDefault 擋原生 toggle、翻「第 idx 個 details」的 open 寫回 p.text
    //     （DOMParser 精準改，不用字串正則；idx 以 DOM 順序對應 p.text 順序）。re-render 後 CSS 依 open 收合。
    //   • 點/雙擊 summary 標題文字 → 一律 preventDefault 擋原生 toggle（避免點標題誤收合）；
    //     雙擊 → emitAppEvent('text-card-edit') 開編輯模態（與雙擊任何文字卡一致；純 toggle 卡也進得去）。
    useEffect(() => {
        if (isEditing || !hasToggle) return
        const el = viewContainerRef.current
        if (!el) return
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const summary = target.closest('details.toggle-block > summary')
            if (!summary) return
            e.preventDefault() // 擋原生 <details> toggle（顯示由 p.text 的 open 驅動）
            if (!target.closest('[data-toggle-caret]')) return // 標題文字：只擋 toggle，其餘交給 tldraw
            e.stopPropagation()
            const details = summary.closest('details.toggle-block') as HTMLElement
            const idx = [...el.querySelectorAll('details.toggle-block')].indexOf(details)
            if (idx < 0) return
            const doc = new DOMParser().parseFromString(shape.props.text || '', 'text/html')
            const tgt = doc.querySelectorAll('details.toggle-block')[idx] as HTMLDetailsElement | undefined
            if (!tgt) return
            if (tgt.hasAttribute('open')) tgt.removeAttribute('open')
            else tgt.setAttribute('open', 'open')
            const newText = doc.body.innerHTML
            if (newText !== shape.props.text) {
                tldrawEditor.updateShape({ id: shape.id, type: 'card', props: { text: newText } })
            }
        }
        const onDblClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (!target.closest('details.toggle-block > summary')) return
            if (target.closest('[data-toggle-caret]')) return // 三角形不進編輯
            emitAppEvent('text-card-edit', { shapeId: shape.id })
        }
        el.addEventListener('click', onClick, true)
        el.addEventListener('dblclick', onDblClick, true)
        return () => {
            el.removeEventListener('click', onClick, true)
            el.removeEventListener('dblclick', onDblClick, true)
        }
    }, [isEditing, hasToggle, p.text, shape.id, shape.props.text, tldrawEditor])

    const tiptap = useTiptap({
        extensions: [
            StarterKit.configure({ codeBlock: false }), // 停用預設 CodeBlock
            Underline,
            TextStyle,
            Color,
            CodeBlockLowlight.configure({ lowlight }), // 取代為有語法高亮的版本
            // 超連結：autolink 讓打字時自動偵測網址，linkOnPaste 讓貼上網址即成連結。
            // openOnClick:false — 編輯模式點連結只移游標不跳轉；唯讀模式的跳轉走
            // viewContainerRef 的 capture-phase listener（tldraw 會攔 pointer 事件，見下方）。
            Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
            Highlight, // 螢光筆（單色，<mark>）
            Callout, // 提示框（進階批：靜態 block，唯讀走純 CSS）
            ToggleBlock, ToggleSummary, ToggleContent, // 摺疊區塊（原生 <details>，唯讀免 JS 摺疊）
            MathBlock, // 數學式區塊（LaTeX；渲染結果存進 HTML 供唯讀注入）
            // 空白卡片提示：接上階段 1 `/` 選單的可發現性——沒有這行，使用者不會知道有 `/`
            Placeholder.configure({ placeholder: '輸入文字，或按 / 選擇格式…' }),
        ],
        content: p.text || '<p></p>',
        editable: isEditing,
        editorProps: {
            // 回傳 true ＝ 攔下，PM 不再跑預設行為（見上方 slashKeyRef 的說明）
            // 兩者不會同時開（matchSlashQuery 讓 `[[` 優先），順序只是保險
            handleKeyDown: (_view, event) => slashKeyRef.current(event) || suggestKeyRef.current(event),
            handleDOMEvents: {
                // 編輯模式下點摺疊區塊的三角形，原生 <details> 會收合並藏住正在編輯的內文。
                // preventDefault 取消原生 toggle（游標放置走 mousedown，不受影響），讓它編輯時恆展開。
                click: (_view, event) => {
                    const t = event.target as HTMLElement
                    if (t.closest?.('details.toggle-block > summary')) event.preventDefault()
                    return false
                },
            },
        },
        onUpdate: ({ editor }) => {
            // 一般文字編輯靠 onBlur 存檔即可。但數學式的 latex 是在 nodeView 的 <input> 裡改的，
            // 焦點一離開 contenteditable、onBlur 就已經存過一次（那時 latex 還是舊值），之後的
            // setNodeMarkup 不會再觸發 onBlur。故這裡補一道：任何 doc 變更都把最新內容寫回 shape。
            tldrawEditor.updateShape({ id: shape.id, type: 'card', props: { text: editor.getHTML() } })
        },
        onBlur: ({ editor }) => {
            const html = editor.getHTML()
            if (preventResize) {
                // Modal 模式：只存內容，不呼叫 exitEdit（modal 由背景點擊或 ESC 關閉）
                tldrawEditor.updateShape({
                    id: shape.id,
                    type: 'card',
                    props: { text: html },
                })
            } else {
                // 一般模式：保留現有高度，只在需要時擴大，然後退出編輯
                const currentH = shape.props.h
                const lineCount = (html.match(/<\/p>|<\/h[123]>|<\/li>|<\/pre>/g) || []).length || 1
                const estimatedH = Math.max(80, lineCount * 28 + 80)
                const newH = Math.max(currentH, estimatedH)
                tldrawEditor.updateShape({
                    id: shape.id,
                    type: 'card',
                    props: { text: html, h: newH },
                })
                exitEdit()
            }
        },
    })

    useEffect(() => {
        if (!tiptap) return
        tiptap.setEditable(isEditing)
        if (isEditing) {
            setTimeout(() => tiptap.commands.focus('end'), 0)
        }
        if (!isEditing) { setSuggest(null); setSlash(null) }
    }, [isEditing, tiptap])

    // [[xxx]] autocomplete trigger
    useEffect(() => {
        if (!tiptap || !isEditing) return
        const handler = () => {
            const { state } = tiptap
            const { from } = state.selection
            const textBefore = state.doc.textBetween(Math.max(0, from - 120), from, '\n')
            const match = textBefore.match(/\[\[([^\]]*)$/)
            if (!match) { setSuggest(null); return }
            const query = match[1]
            const matches = filterLinkTargets(linkTargets, query)
            if (matches.length === 0) { setSuggest(null); return }
            const coords = tiptap.view.coordsAtPos(from)
            setSuggest(prev => ({
                query,
                from: from - match[0].length,
                coords: { x: coords.left, y: coords.bottom + 4 },
                index: prev?.query === query ? prev.index : 0,
                matches,
            }))
        }
        tiptap.on('update', handler)
        tiptap.on('selectionUpdate', handler)
        return () => {
            tiptap.off('update', handler)
            tiptap.off('selectionUpdate', handler)
        }
    }, [tiptap, isEditing, linkTargets])

    // `/` 選單觸發（matchSlashQuery 內已讓 `[[` 補全優先，兩者不會同時開）
    useEffect(() => {
        if (!tiptap || !isEditing) return
        const handler = () => {
            const { state } = tiptap
            const { from } = state.selection
            const textBefore = state.doc.textBetween(Math.max(0, from - 120), from, '\n')
            const hit = matchSlashQuery(textBefore)
            if (!hit) { setSlash(null); return }
            const matches = filterCommands(SLASH_COMMANDS, hit.query)
            if (matches.length === 0) { setSlash(null); return }
            const coords = tiptap.view.coordsAtPos(from)
            setSlash(prev => ({
                query: hit.query,
                from: from - hit.length,
                coords: { x: coords.left, y: coords.bottom + 4 },
                index: prev?.query === hit.query ? prev.index : 0,
                matches,
            }))
        }
        tiptap.on('update', handler)
        tiptap.on('selectionUpdate', handler)
        return () => {
            tiptap.off('update', handler)
            tiptap.off('selectionUpdate', handler)
        }
    }, [tiptap, isEditing])

    const runSlash = useCallback((cmd: SlashCommand) => {
        if (!tiptap || !slashRef.current) return
        const { from: curFrom } = tiptap.state.selection
        // apply 內部會先 deleteRange 掉使用者打的 `/query` 再套用命令
        cmd.apply(tiptap, { from: slashRef.current.from, to: curFrom })
        setSlash(null)
    }, [tiptap])

    // 每次 render 更新，讓 useTiptap 的一次性 handleKeyDown 讀到最新 state/callback
    slashKeyRef.current = (event: KeyboardEvent): boolean => {
        const s = slashRef.current
        if (!s || s.matches.length === 0) return false
        if (event.key === 'ArrowDown') {
            setSlash(prev => prev ? { ...prev, index: (prev.index + 1) % prev.matches.length } : prev)
            return true
        }
        if (event.key === 'ArrowUp') {
            setSlash(prev => prev ? { ...prev, index: (prev.index - 1 + prev.matches.length) % prev.matches.length } : prev)
            return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            runSlash(s.matches[s.index])
            return true
        }
        if (event.key === 'Escape') {
            setSlash(null)
            return true
        }
        return false
    }

    const insertCompletion = useCallback((name: string) => {
        if (!tiptap || !suggestRef.current) return
        const { from: curFrom } = tiptap.state.selection
        tiptap.chain().focus()
            .deleteRange({ from: suggestRef.current.from, to: curFrom })
            .insertContent(`[[${name}]]`)
            .run()
        setSuggest(null)
    }, [tiptap])

    // 每次 render 更新，理由同 slashKeyRef
    suggestKeyRef.current = (event: KeyboardEvent): boolean => {
        const s = suggestRef.current
        if (!s || s.matches.length === 0) return false
        if (event.key === 'ArrowDown') {
            setSuggest(prev => prev ? { ...prev, index: (prev.index + 1) % prev.matches.length } : prev)
            return true
        }
        if (event.key === 'ArrowUp') {
            setSuggest(prev => prev ? { ...prev, index: (prev.index - 1 + prev.matches.length) % prev.matches.length } : prev)
            return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            insertCompletion(s.matches[s.index].name)
            return true
        }
        if (event.key === 'Escape') {
            setSuggest(null)
            return true
        }
        return false
    }

    const handleSave = useCallback(() => {
        if (!tiptap) return
        const html = tiptap.getHTML()
        tldrawEditor.updateShape({
            id: shape.id,
            type: 'card',
            props: { text: html },
        })
    }, [tiptap, tldrawEditor, shape.id])

    useEffect(() => {
        if (!isEditing) handleSave()
    }, [isEditing, handleSave])

    // [[xxx]] → clickable blue spans in view mode
    const processedHtml = useMemo(() => {
        if (!p.text) return ''
        let html = p.text.replace(
            /\[\[([^\]]+)\]\]/g,
            (_, name) => `<span class="wiki-link" data-wikilink="${encodeURIComponent(name)}" style="color:#3b82f6;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;border-radius:2px;padding:0 1px">[[${name}]]</span>`
        )
        // 唯讀顯示層：在每個 toggle summary 開頭注入可點的三角形 ▶（Notion 式獨立收合目標）。
        // ⚠️ 只在顯示層加、**不進 p.text**（存檔/持久化都走乾淨的 p.text，三角形不會被當 summary 內文）。
        // 這也是為何要有真實 <span data-toggle-caret> 而非 CSS ::before——才分辨得出「點的是三角形還是標題」。
        if (html.includes('toggle-block')) {
            const doc = new DOMParser().parseFromString(html, 'text/html')
            doc.querySelectorAll('details.toggle-block > summary').forEach((sm) => {
                const caret = doc.createElement('span')
                caret.className = 'toggle-caret'
                caret.setAttribute('data-toggle-caret', '')
                caret.setAttribute('contenteditable', 'false')
                caret.textContent = '▶'
                sm.insertBefore(caret, sm.firstChild)
            })
            html = doc.body.innerHTML
        }
        return html
    }, [p.text])

    // ⚠️ 唯讀內容用 useMemo 鎖成「同一個 React 元素」，只在 processedHtml（＝p.text）變時才重建。
    // 關鍵：Toggle 的展開/收合狀態只存在原生 <details open> 的 DOM 上，不在 p.text 裡。
    // 若每次 render 都重新套用 dangerouslySetInnerHTML，React 會用 p.text（永遠 open="open"）重建
    // <details>、把使用者剛點的收合洗掉。而方案 A 的 auto-fit 收合後必呼叫 updateShape → 觸發 render，
    // 正好踩中這個洗除。memo 成穩定參照後，h 變化的 render 會被 React bail-out、不碰這棵子樹＝收合得以保留。
    const readonlyContent = useMemo(() => (
        <div className="tiptap-readonly" dangerouslySetInnerHTML={{ __html: processedHtml }} />
    ), [processedHtml])

    if (!isEditing) {
        const isEmpty = !p.text || p.text === '<p></p>'

        const getTextLength = (html: string) => {
            const temp = document.createElement('div')
            temp.innerHTML = html
            return (temp.textContent || temp.innerText || '').length
        }
        const textLength = getTextLength(p.text || '')
        // 含 Toggle 的卡片走 auto-fit：內容一定貼合卡片，故只有「超過上限被裁切」時才顯示 fade/footer；
        // 一般卡片維持原本以字數判斷。
        const isLong = hasToggle ? toggleFitClipped : textLength > 200

        return (
            <div
                ref={viewContainerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        padding: '14px 16px 0',
                        position: 'relative',
                    }}
                >
                    {isEmpty ? (
                        <span style={{ color: '#ccc', fontSize: 15, pointerEvents: 'none' }}>
                            點擊兩下開始輸入...
                        </span>
                    ) : (
                        <>
                            {readonlyContent}
                            {isLong && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0, left: 0, right: 0,
                                    height: 48,
                                    background: `linear-gradient(to bottom, transparent, ${cardBg})`,
                                    pointerEvents: 'none',
                                }} />
                            )}
                        </>
                    )}
                </div>

                {isLong && !isEmpty && (
                    <div style={{
                        flexShrink: 0,
                        padding: '6px 18px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12,
                        color: '#aaa',
                        borderTop: '1px solid #f0f0f0',
                    }}>
                        <span>📄 {textLength} 字</span>
                        <span style={{ fontSize: 11 }}>雙擊編輯</span>
                    </div>
                )}
            </div>
        )
    }

    return (
        <>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    position: 'relative',
                }}
                onPointerDown={(e) => {
                    if (isEditing) e.stopPropagation()
                }}
            >
                <Toolbar tiptap={tiptap} isDark={isDark} />

                <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
                    <EditorContent
                        editor={tiptap}
                        style={{ height: '100%', outline: 'none' }}
                    />
                </div>
            </div>

            {/* [[xxx]] autocomplete dropdown — position:fixed to escape card clipping */}
            {suggest && (
                <SuggestPopup coords={suggest.coords} isDark={isDark} footer="↑↓ 選擇  Tab/Enter 確認  Esc 關閉">
                    {groupLinkTargets(suggest.matches).map(({ group, items }) => (
                        <div key={group}>
                            <div style={{
                                padding: '5px 12px 2px', fontSize: 10, fontWeight: 700,
                                letterSpacing: '0.5px', color: T.textMuted,
                            }}>{group}</div>
                            {items.map(t => {
                                // index 是對 suggest.matches 的全域序號，分組顯示時要換算回去
                                const i = suggest.matches.indexOf(t)
                                const active = i === suggest.index
                                return (
                                    <div
                                        key={t.kind + ':' + t.name}
                                        onPointerDown={() => insertCompletion(t.name)}
                                        style={{
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            background: active ? (T.accentBg) : 'transparent',
                                            color: active ? '#60a5fa' : (T.textPrimary),
                                            borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        <span style={{ flexShrink: 0, opacity: 0.7 }}>{t.kind === 'board' ? '🗂️' : '📝'}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </SuggestPopup>
            )}

            {/* `/` 選單 */}
            {slash && (
                <SuggestPopup coords={slash.coords} isDark={isDark} footer="↑↓ 選擇  Tab/Enter 確認  Esc 關閉">
                    {groupSlashCommands(slash.matches).map(({ group, items }) => (
                        <div key={group}>
                            <div style={{
                                padding: '5px 12px 2px', fontSize: 10, fontWeight: 700,
                                letterSpacing: '0.5px', color: T.textMuted,
                            }}>{group}</div>
                            {items.map(cmd => {
                                // index 是對 slash.matches 的全域序號，分組顯示時要換算回去
                                const i = slash.matches.indexOf(cmd)
                                const active = i === slash.index
                                return (
                                    <div
                                        key={cmd.id}
                                        onPointerDown={() => runSlash(cmd)}
                                        style={{
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 9,
                                            background: active ? (T.accentBg) : 'transparent',
                                            color: active ? '#60a5fa' : (T.textPrimary),
                                            borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                                        }}
                                    >
                                        {/* 顏色項用該色本身當圖示色（Icon 吃 currentColor）；其餘一律次級灰。 */}
                                        <span style={{
                                            width: 20, flexShrink: 0,
                                            display: 'flex', justifyContent: 'center',
                                            color: cmd.id.startsWith('color-')
                                                ? cmd.id.slice(6)
                                                : (T.textSecondary),
                                        }}><Icon name={cmd.icon} /></span>
                                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {cmd.title}
                                        </span>
                                        {cmd.hint && (
                                            <span style={{
                                                flexShrink: 0, fontSize: 10, fontFamily: 'monospace',
                                                color: T.textMuted,
                                            }}>{cmd.hint}</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </SuggestPopup>
            )}
        </>
    )
}