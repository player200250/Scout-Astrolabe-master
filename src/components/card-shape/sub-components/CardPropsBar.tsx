import React, { useState } from 'react'
import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import type { CardStatusType, PriorityType } from '../type/CardShape'

export interface CardPropsBarProps {
    editor: Editor
    shape: TLCardShape
    isDark?: boolean
}

export function CardPropsBar({ editor, shape, isDark = false }: CardPropsBarProps) {
    const p = shape.props
    const [tagInput, setTagInput] = useState('')
    const currentStatus = (p.cardStatus ?? 'none') as CardStatusType
    const currentPriority = (p.priority ?? 'none') as PriorityType
    const tags: string[] = p.tags ?? []

    const setStatus = (cardStatus: CardStatusType) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { cardStatus } })
    }
    const setPriority = (priority: PriorityType) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { priority } })
    }
    const addTag = () => {
        const t = tagInput.trim()
        if (!t || tags.includes(t)) { setTagInput(''); return }
        editor.updateShape({ id: shape.id, type: 'card', props: { tags: [...tags, t] } })
        setTagInput('')
    }
    const removeTag = (tag: string) =>
        editor.updateShape({ id: shape.id, type: 'card', props: { tags: tags.filter(t => t !== tag) } })

    const selectStyle: React.CSSProperties = {
        fontSize: 11,
        border: `1px solid ${isDark ? '#475569' : '#e0e0e0'}`,
        borderRadius: 4,
        padding: '2px 4px',
        background: isDark ? '#2d3748' : 'white',
        color: isDark ? '#e2e8f0' : 'inherit',
        cursor: 'pointer',
    }

    return (
        <div
            onPointerDown={e => e.stopPropagation()}
            style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
                padding: '4px 8px', borderBottom: `1px solid ${isDark ? '#334155' : '#f0f0f0'}`,
                background: isDark ? '#1a2035' : '#fafafa', flexShrink: 0, minHeight: 30,
            }}
        >
            <select value={currentStatus} onChange={e => setStatus(e.target.value as CardStatusType)}
                onPointerDown={e => e.stopPropagation()} style={selectStyle}
            >
                <option value="none">⬜ 無</option>
                <option value="todo">📋 待辦</option>
                <option value="in-progress">🔵 進行中</option>
                <option value="done">✅ 完成</option>
            </select>

            <select value={currentPriority} onChange={e => setPriority(e.target.value as PriorityType)}
                onPointerDown={e => e.stopPropagation()} style={selectStyle}
            >
                <option value="none">— 無</option>
                <option value="low">🟡 低</option>
                <option value="medium">🟠 中</option>
                <option value="high">🔴 高</option>
            </select>

            <div style={{ width: 1, height: 14, background: '#e0e0e0', flexShrink: 0 }} />

            {tags.map(tag => (
                <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 1,
                    background: '#eff6ff', color: '#2563eb',
                    borderRadius: 10, padding: '1px 6px 1px 7px', fontSize: 10, fontWeight: 500,
                }}>
                    #{tag}
                    <button
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => removeTag(tag)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 12, color: '#93c5fd', lineHeight: 1 }}
                    >×</button>
                </span>
            ))}

            <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); addTag() }
                    if (e.key === 'Escape') setTagInput('')
                }}
                onPointerDown={e => e.stopPropagation()}
                placeholder="+ 標籤"
                style={{ border: 'none', outline: 'none', fontSize: 10, background: 'transparent', minWidth: 44, color: isDark ? '#64748b' : '#aaa' }}
            />
        </div>
    )
}
