import { useEffect, useCallback } from 'react'
import { type Editor as TldrawEditor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'

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
                background: active ? '#e8f0fe' : 'transparent',
                color: active ? '#1971c2' : '#333',
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

function Toolbar({ tiptap }: { tiptap: ReturnType<typeof useTiptap> }) {
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
                borderBottom: '1px solid #eee',
                background: '#fafafa',
                borderRadius: '8px 8px 0 0',
                flexShrink: 0,
            }}
        >
            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleBold().run()}
                active={tiptap.isActive('bold')}
                title="粗體"
            >
                <b>B</b>
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleItalic().run()}
                active={tiptap.isActive('italic')}
                title="斜體"
            >
                <i>I</i>
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleUnderline().run()}
                active={tiptap.isActive('underline')}
                title="底線"
            >
                <u>U</u>
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: '#ddd', margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHeading({ level: 1 }).run()}
                active={tiptap.isActive('heading', { level: 1 })}
                title="標題 1"
            >
                H1
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHeading({ level: 2 }).run()}
                active={tiptap.isActive('heading', { level: 2 })}
                title="標題 2"
            >
                H2
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: '#ddd', margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleBulletList().run()}
                active={tiptap.isActive('bulletList')}
                title="條列清單"
            >
                ≡
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleOrderedList().run()}
                active={tiptap.isActive('orderedList')}
                title="數字清單"
            >
                1≡
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: '#ddd', margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleCodeBlock().run()}
                active={tiptap.isActive('codeBlock')}
                title="程式碼區塊（語法高亮）"
            >
                {'</>'}
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: '#ddd', margin: '0 4px' }} />

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
   TextContent 主組件
================================================ */
export function TextContent({ editor: tldrawEditor, shape, isEditing, exitEdit, preventResize = false }: TextContentProps) {
    const p = shape.props

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
        onBlur: ({ editor }) => {
            const html = editor.getHTML()
            if (preventResize) {
                // Modal 模式：只存內容，不改高度
                tldrawEditor.updateShape({
                    id: shape.id,
                    type: 'card',
                    props: { text: html },
                })
            } else {
                // 一般模式：保留現有高度，只在需要時擴大
                const currentH = shape.props.h
                const lineCount = (html.match(/<\/p>|<\/h[123]>|<\/li>|<\/pre>/g) || []).length || 1
                const estimatedH = Math.max(80, lineCount * 28 + 80)
                const newH = Math.max(currentH, estimatedH)
                tldrawEditor.updateShape({
                    id: shape.id,
                    type: 'card',
                    props: { text: html, h: newH },
                })
            }
            exitEdit()
        },
    })

    useEffect(() => {
        if (!tiptap) return
        tiptap.setEditable(isEditing)
        if (isEditing) {
            setTimeout(() => tiptap.commands.focus('end'), 0)
        }
    }, [isEditing, tiptap])

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
                        padding: '14px 18px 0',
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
                                dangerouslySetInnerHTML={{ __html: p.text || '' }}
                            />
                            {isLong && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0, left: 0, right: 0,
                                    height: 48,
                                    background: 'linear-gradient(to bottom, transparent, white)',
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
            <Toolbar tiptap={tiptap} />

            <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
                <EditorContent
                    editor={tiptap}
                    style={{ height: '100%', outline: 'none' }}
                />
            </div>
        </div>
    )
}