import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BoardRecord } from '../db'
import { getCardShapes } from '../utils/snapshot'
import type { SnapshotCardShape } from '../utils/snapshot'

interface DeleteBoardDialogProps {
    board: BoardRecord
    hasInbox: boolean
    onConfirm: (moveToInbox: boolean) => void
    onCancel: () => void
    isDark: boolean
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function getTypeIcon(type: string | undefined): string {
    switch (type) {
        case 'todo': return '✅'
        case 'link': return '🔗'
        case 'image': return '🖼️'
        case 'board': return '📋'
        case 'journal': return '📔'
        default: return '📝'
    }
}

function getCardPreview(card: SnapshotCardShape): { text: string; extra?: string } {
    const { props } = card
    if (props.type === 'todo') {
        const todos = props.todos ?? []
        const total = todos.length
        const completed = todos.filter(t => t.checked).length
        const raw = stripHtml(props.text ?? '').slice(0, 40) || '(Todo 卡片)'
        return { text: raw, extra: `${total} 個項目（${completed} 個已完成）` }
    }
    const raw = stripHtml(props.text ?? '').slice(0, 40) || `(${props.type ?? '卡片'})`
    return { text: raw }
}

const MAX_PREVIEW = 20

export function DeleteBoardDialog({ board, hasInbox, onConfirm, onCancel, isDark }: DeleteBoardDialogProps) {
    const [expanded, setExpanded] = useState(false)
    const [moveToInbox, setMoveToInbox] = useState(false)
    const confirmRef = useRef<HTMLButtonElement>(null)

    const cards = getCardShapes(board.snapshot)
    const visibleCards = cards.slice(0, MAX_PREVIEW)
    const extraCount = cards.length - MAX_PREVIEW

    useEffect(() => {
        confirmRef.current?.focus()
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(moveToInbox) }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onConfirm, onCancel, moveToInbox])

    const bg = isDark ? '#1e293b' : '#ffffff'
    const text = isDark ? '#e2e8f0' : '#1a1a1a'
    const muted = isDark ? '#94a3b8' : '#666'
    const border = isDark ? '#334155' : '#e5e7eb'
    const listBg = isDark ? '#0f172a' : '#f8fafc'
    const itemBg = isDark ? '#1e293b' : '#ffffff'
    const checkBg = isDark ? '#1e293b' : '#f8fafc'

    return createPortal(
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99998 }}
                onClick={onCancel}
            />
            <div style={{
                position: 'fixed', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                background: bg, borderRadius: 14, padding: '24px', width: 480,
                boxShadow: '0 8px 40px rgba(0,0,0,0.3)', zIndex: 99999,
                border: `1px solid ${border}`,
                display: 'flex', flexDirection: 'column', gap: 12,
            }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: text }}>
                    將「{board.name}」移到垃圾桶？
                </div>

                <div style={{ fontSize: 13, color: muted }}>
                    {cards.length > 0
                        ? `白板內有 ${cards.length} 張卡片將一併移入垃圾桶。`
                        : '此白板沒有卡片。'}
                </div>

                {cards.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                            onClick={() => setExpanded(prev => !prev)}
                            style={{
                                alignSelf: 'flex-start',
                                background: 'transparent', border: 'none',
                                cursor: 'pointer', fontSize: 13,
                                color: isDark ? '#60a5fa' : '#2563eb',
                                padding: 0, display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            {expanded ? '▲ 收起' : '▼ 查看卡片'}
                        </button>

                        <div style={{
                            overflow: 'hidden',
                            maxHeight: expanded ? '252px' : '0px',
                            transition: 'max-height 0.2s ease',
                        }}>
                            <div style={{
                                background: listBg, borderRadius: 8,
                                border: `1px solid ${border}`,
                                overflowY: 'auto', maxHeight: '240px',
                                display: 'flex', flexDirection: 'column', gap: 2, padding: 6,
                            }}>
                                {visibleCards.map(card => {
                                    const { text: preview, extra } = getCardPreview(card)
                                    return (
                                        <div key={card.id} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 8,
                                            padding: '6px 8px', borderRadius: 6,
                                            background: itemBg,
                                            fontSize: 12, color: text,
                                        }}>
                                            <span style={{ flexShrink: 0, lineHeight: 1.4 }}>
                                                {getTypeIcon(card.props.type as string | undefined)}
                                            </span>
                                            <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.4 }}>
                                                {preview}
                                                {extra && (
                                                    <span style={{ color: muted, marginLeft: 6, fontSize: 11 }}>
                                                        {extra}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    )
                                })}
                                {extraCount > 0 && (
                                    <div style={{ fontSize: 12, color: muted, padding: '4px 8px' }}>
                                        還有 {extraCount} 張...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {hasInbox && (
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        cursor: 'pointer', fontSize: 13, color: text,
                        background: checkBg, borderRadius: 8, padding: '10px 12px',
                        border: `1px solid ${border}`,
                        userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={moveToInbox}
                            onChange={e => setMoveToInbox(e.target.checked)}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }}
                        />
                        將卡片移到收件匣（白板仍會刪除）
                    </label>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: `1px solid ${border}`,
                            background: 'transparent', cursor: 'pointer',
                            fontSize: 13, color: muted,
                        }}
                    >
                        取消
                    </button>
                    <button
                        ref={confirmRef}
                        onClick={() => onConfirm(moveToInbox)}
                        style={{
                            padding: '8px 16px', borderRadius: 8, border: 'none',
                            background: '#dc2626', color: 'white',
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}
                    >
                        移到垃圾桶
                    </button>
                </div>
            </div>
        </>,
        document.body
    )
}
