import { useEffect, useCallback, useContext, useState, useMemo, useRef } from 'react'
import { type Editor as TldrawEditor, useIsDarkMode } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { CARD_COLORS } from '../type/CardShape'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { BacklinksContext } from '../../../hooks/useBacklinks'
import { Z_MODAL } from '../../../constants'
import { emitAppEvent } from '../../../utils/appEvents'
import { buildSlashCommands, matchSlashQuery, groupSlashCommands, type SlashCommand } from '../../../utils/slashCommands'
import { filterCommands } from '../../../utils/commands'

// registry 是純資料、與元件無關 → 模組層建一次即可，不隨每次 render 重算
const SLASH_COMMANDS = buildSlashCommands()

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
    isDark,
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
                background: active ? (isDark ? '#1e3a5f' : '#e8f0fe') : 'transparent',
                color: active ? '#60a5fa' : (isDark ? '#cbd5e1' : '#333'),
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
                borderBottom: `1px solid ${isDark ? '#334155' : '#eee'}`,
                background: isDark ? '#0f172a' : '#fafafa',
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

            <span style={{ width: 1, height: 16, background: isDark ? '#475569' : '#ddd', margin: '0 4px' }} />

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

            <span style={{ width: 1, height: 16, background: isDark ? '#475569' : '#ddd', margin: '0 4px' }} />

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

            <span style={{ width: 1, height: 16, background: isDark ? '#475569' : '#ddd', margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleCodeBlock().run()}
                active={tiptap.isActive('codeBlock')}
                title="程式碼區塊（語法高亮）"
                isDark={isDark}
            >
                {'</>'}
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: isDark ? '#475569' : '#ddd', margin: '0 4px' }} />

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
    matches: string[]
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
    coords, isDark, footer, children,
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
                background: isDark ? '#1e293b' : 'white',
                border: `1px solid ${isDark ? '#334155' : '#e0e0e0'}`,
                borderRadius: 8,
                boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
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
                color: isDark ? '#64748b' : '#bbb',
                borderTop: `1px solid ${isDark ? '#334155' : '#f0f0f0'}`,
                background: isDark ? '#0f172a' : '#fafafa',
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
    const { boardNames } = useContext(BacklinksContext)
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
    useEffect(() => {
        const el = viewContainerRef.current
        if (!el) return
        const handler = (e: PointerEvent) => {
            const target = e.target as HTMLElement
            const encoded = (target.closest('[data-wikilink]') as HTMLElement | null)?.getAttribute('data-wikilink')
            if (!encoded) return
            e.stopPropagation()
            e.preventDefault()
            const name = decodeURIComponent(encoded)
            emitAppEvent('jump-to-card', { targetName: name })
        }
        el.addEventListener('pointerdown', handler, { capture: true })
        return () => el.removeEventListener('pointerdown', handler, { capture: true })
    // re-attach after switching back to view mode (ref re-mounts)
    }, [isEditing])

    const tiptap = useTiptap({
        extensions: [
            StarterKit.configure({ codeBlock: false }), // 停用預設 CodeBlock
            Underline,
            TextStyle,
            Color,
            CodeBlockLowlight.configure({ lowlight }), // 取代為有語法高亮的版本
        ],
        content: p.text || '<p></p>',
        editable: isEditing,
        editorProps: {
            // 回傳 true ＝ 攔下，PM 不再跑預設行為（見上方 slashKeyRef 的說明）
            // 兩者不會同時開（matchSlashQuery 讓 `[[` 優先），順序只是保險
            handleKeyDown: (_view, event) => slashKeyRef.current(event) || suggestKeyRef.current(event),
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
            const matches = boardNames
                .filter(n => n.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8)
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
    }, [tiptap, isEditing, boardNames])

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
            insertCompletion(s.matches[s.index])
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
        return p.text.replace(
            /\[\[([^\]]+)\]\]/g,
            (_, name) => `<span class="wiki-link" data-wikilink="${encodeURIComponent(name)}" style="color:#3b82f6;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;border-radius:2px;padding:0 1px">[[${name}]]</span>`
        )
    }, [p.text])

    if (!isEditing) {
        const isEmpty = !p.text || p.text === '<p></p>'

        const getTextLength = (html: string) => {
            const temp = document.createElement('div')
            temp.innerHTML = html
            return (temp.textContent || temp.innerText || '').length
        }
        const textLength = getTextLength(p.text || '')
        const isLong = textLength > 200

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
                            <div
                                className="tiptap-readonly"
                                dangerouslySetInnerHTML={{ __html: processedHtml }}
                            />
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
                    {suggest.matches.map((name, i) => (
                        <div
                            key={name}
                            onPointerDown={() => insertCompletion(name)}
                            style={{
                                padding: '6px 12px',
                                cursor: 'pointer',
                                background: i === suggest.index ? (isDark ? '#1e3a5f' : '#eff6ff') : 'transparent',
                                color: i === suggest.index ? '#60a5fa' : (isDark ? '#cbd5e1' : '#1a1a1a'),
                                borderLeft: i === suggest.index ? '2px solid #3b82f6' : '2px solid transparent',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {name}
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
                                letterSpacing: '0.5px', color: isDark ? '#64748b' : '#aaa',
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
                                            background: active ? (isDark ? '#1e3a5f' : '#eff6ff') : 'transparent',
                                            color: active ? '#60a5fa' : (isDark ? '#cbd5e1' : '#1a1a1a'),
                                            borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                                        }}
                                    >
                                        <span style={{
                                            width: 20, flexShrink: 0, textAlign: 'center',
                                            fontSize: 11, fontFamily: 'monospace',
                                            color: cmd.id.startsWith('color-')
                                                ? cmd.id.slice(6)
                                                : (isDark ? '#94a3b8' : '#888'),
                                        }}>{cmd.icon}</span>
                                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {cmd.title}
                                        </span>
                                        {cmd.hint && (
                                            <span style={{
                                                flexShrink: 0, fontSize: 10, fontFamily: 'monospace',
                                                color: isDark ? '#475569' : '#c0c0c0',
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