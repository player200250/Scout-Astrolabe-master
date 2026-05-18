import { useState, useRef, useCallback } from 'react'
import { useIsDarkMode } from '@tldraw/editor'
import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { CARD_COLORS } from '../type/CardShape'

interface GroupContentProps {
    editor: Editor
    shape: TLCardShape
}

export function GroupContent({ editor, shape }: GroupContentProps) {
    const p = shape.props
    const isDark = useIsDarkMode()
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const hasColor = p.color && p.color !== 'none'
    const titleColor = hasColor
        ? CARD_COLORS[p.color].accent
        : isDark ? '#94a3b8' : '#6b7280'

    const lastPointerDownRef = useRef(0)

    const startEdit = () => {
        setDraft(p.text || '群組')
        setEditing(true)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    }

    const handleTitlePointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation()
        const now = Date.now()
        if (now - lastPointerDownRef.current < 300) {
            startEdit()
            lastPointerDownRef.current = 0
        } else {
            lastPointerDownRef.current = now
        }
    }, [p.text])

    const commitEdit = () => {
        editor.updateShape({ id: shape.id, type: 'card', props: { text: draft.trim() || '群組' } })
        setEditing(false)
    }

    return (
        <div
            style={{
                position: 'absolute',
                top: -28,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'auto',
                userSelect: 'none',
            }}
            onPointerDown={e => e.stopPropagation()}
        >
            {editing ? (
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditing(false)
                    }}
                    style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: titleColor,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: `1.5px solid ${titleColor}`,
                        outline: 'none',
                        padding: '0 2px',
                        minWidth: 60,
                        width: Math.max(60, draft.length * 9 + 18),
                        maxWidth: 320,
                        lineHeight: '20px',
                    }}
                />
            ) : (
                <span
                    onPointerDown={handleTitlePointerDown}
                    style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: titleColor,
                        cursor: 'text',
                        lineHeight: '20px',
                        whiteSpace: 'nowrap',
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {p.text || '群組'}
                </span>
            )}
        </div>
    )
}
