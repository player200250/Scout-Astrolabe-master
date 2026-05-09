import { useRef, useEffect } from 'react'
import { useIsDarkMode } from '@tldraw/editor'
import { useEditor } from 'tldraw'
import type { TLCardShape } from '../type/CardShape'
import { CARD_COLORS } from '../type/CardShape'

interface HeadingContentProps {
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
}

export function HeadingContent({ shape, isEditing, exitEdit }: HeadingContentProps) {
    const editor = useEditor()
    const isDark = useIsDarkMode()
    const p = shape.props
    const inputRef = useRef<HTMLInputElement>(null)

    const colorStyle = CARD_COLORS[p.color ?? 'none']
    const hasColor = p.color && p.color !== 'none'
    const textColor = hasColor ? colorStyle.accent : (isDark ? '#f1f5f9' : '#1a1a1a')

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { text: e.target.value } })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            exitEdit()
        }
    }

    const sharedStyle: React.CSSProperties = {
        fontSize: 28,
        fontWeight: 600,
        color: textColor,
        lineHeight: 1.2,
        fontFamily: 'inherit',
    }

    if (isEditing) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'border-box' }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={p.text || ''}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={exitEdit}
                    style={{
                        ...sharedStyle,
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        padding: 0,
                    }}
                />
            </div>
        )
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'border-box' }}>
            <span style={{
                ...sharedStyle,
                userSelect: 'none',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                display: 'block',
                width: '100%',
            }}>
                {p.text || '標題'}
            </span>
        </div>
    )
}
