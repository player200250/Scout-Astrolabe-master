import { useEffect, useCallback, useContext, useState, useMemo, useRef } from 'react'
import { type Editor as TldrawEditor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { CARD_COLORS } from '../type/CardShape'
import { openLink } from '../../../platform/linkOpener'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import { richTextExtensions } from '../extensions/richText'
import { RichTextToolbar } from './RichTextToolbar'
import { useEditorMenus } from './EditorMenus'
import { BacklinksContext } from '../../../hooks/useBacklinks'
import { emitAppEvent } from '../../../utils/appEvents'
import { buildLinkTargets } from '../../../utils/cardLinks'


// 方案 A（Toggle 自動貼合高度）用的常數
const TOGGLE_FIT_MAX_H = 800  // 上限；超過就裁切＋回到 fade/footer（雙擊編輯看全文）
const TOGGLE_FIT_MIN_H = 80   // 下限；收合到只剩標題時不要比這更矮
const TOGGLE_FIT_CHROME = 28  // 內容外的固定高度（padding-top + border + 底部留白）

interface TextContentProps {
    editor: TldrawEditor
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
    preventResize?: boolean  // Modal 模式下不改高度
}

/* ================================================
   TextContent 主組件
================================================ */
export function TextContent({ editor: tldrawEditor, shape, isEditing, exitEdit, preventResize = false }: TextContentProps) {
    const p = shape.props
    const cardBg = CARD_COLORS[p.color ?? 'none']?.bg ?? '#ffffff'
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
    // `/` 選單與 `[[` 補全的鍵盤處理：由 useEditorMenus 每次 render 更新（原因見 EditorMenus.tsx 開頭）
    const menuKeyRef = useRef<(e: KeyboardEvent) => boolean>(() => false)

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
        // 空白卡片提示：接上階段 1 `/` 選單的可發現性——沒有這行，使用者不會知道有 `/`
        extensions: richTextExtensions('輸入文字，或按 / 選擇格式…'),
        content: p.text || '<p></p>',
        editable: isEditing,
        editorProps: {
            // 回傳 true ＝ 攔下，PM 不再跑預設行為
            handleKeyDown: (_view, event) => menuKeyRef.current(event),
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
    }, [isEditing, tiptap])

    const menuPopups = useEditorMenus(tiptap, isEditing, linkTargets, menuKeyRef)

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
                <RichTextToolbar tiptap={tiptap} />

                <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
                    <EditorContent
                        editor={tiptap}
                        style={{ height: '100%', outline: 'none' }}
                    />
                </div>
            </div>

            {menuPopups}
        </>
    )
}