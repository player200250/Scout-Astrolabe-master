import { useRef, useEffect } from 'react'
import { useIsDarkMode } from '@tldraw/editor'
import { useEditor } from 'tldraw'
import type { TLCardShape, StickyColor } from '../type/CardShape'
import { STICKY_COLORS, STICKY_COLOR_LIST } from '../type/CardShape'

interface StickyContentProps {
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
}

function toStickyColor(color: string): StickyColor {
    return STICKY_COLOR_LIST.includes(color as StickyColor) ? (color as StickyColor) : 'yellow'
}

export function StickyContent({ shape, isEditing, exitEdit }: StickyContentProps) {
    const editor = useEditor()
    const isDark = useIsDarkMode()
    const p = shape.props
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const stickyColor = toStickyColor(p.color)
    const colorStyle = STICKY_COLORS[stickyColor]
    const bgColor = isDark ? colorStyle.darkBg : colorStyle.bg
    const textColor = isDark ? '#ffffff' : '#1a1a1a'

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [isEditing])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { text: e.target.value } })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault()
            exitEdit()
        }
    }

    return (
        <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: bgColor,
            borderRadius: 8,
        }}>
            {/* Fold corner triangle */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 0,
                height: 0,
                borderStyle: 'solid',
                borderWidth: '0 0 24px 24px',
                borderColor: 'transparent transparent rgba(0,0,0,0.15) transparent',
                zIndex: 2,
                pointerEvents: 'none',
            }} />

            {isEditing ? (
                <textarea
                    ref={textareaRef}
                    value={p.text || ''}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={exitEdit}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        padding: '12px 12px 28px 12px',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        color: textColor,
                        boxSizing: 'border-box',
                        lineHeight: 1.5,
                        overflowY: 'auto',
                    }}
                />
            ) : (
                <div style={{
                    padding: '12px 12px 28px 12px',
                    fontSize: 14,
                    color: textColor,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    height: '100%',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                }}>
                    {p.text || ''}
                </div>
            )}
        </div>
    )
}
