import { useState, useContext } from 'react'
import { BacklinksContext, extractCardName, type BacklinkEntry } from '../../../hooks/useBacklinks'
import { emitAppEvent } from '../../../utils/appEvents'
import { T } from '../../../theme/tokens'

interface BacklinksPanelProps {
    shapeId: string
    htmlContent: string
}

export function BacklinksPanel({ shapeId, htmlContent }: BacklinksPanelProps) {
    const { forwardLinks, backlinks, currentBoardName } = useContext(BacklinksContext)
    const [expanded, setExpanded] = useState(false)

    const cardName = extractCardName(htmlContent)
    const fwdLinks: string[] = forwardLinks.get(shapeId) ?? []

    const cardBkLinks: BacklinkEntry[] = cardName
        ? (backlinks.get(cardName.toLowerCase()) ?? [])
        : []
    const boardBkLinks: BacklinkEntry[] = currentBoardName
        ? (backlinks.get(currentBoardName.toLowerCase()) ?? [])
        : []

    const seen = new Set<string>()
    const bkLinks: BacklinkEntry[] = []
    for (const entry of [...cardBkLinks, ...boardBkLinks]) {
        const key = `${entry.boardId}_${entry.shapeId}`
        if (!seen.has(key)) { seen.add(key); bkLinks.push(entry) }
    }

    const total = fwdLinks.length + bkLinks.length
    if (total === 0) return null

    return (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
            <div
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); setExpanded(v => !v) }}
                style={{
                    padding: '3px 12px 4px',
                    background: T.bgOverlay,
                    backdropFilter: 'blur(4px)',
                    borderTop: `1px solid ${T.borderLight}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
            >
                {fwdLinks.length > 0 && (
                    <span style={{ fontSize: 10, color: '#3b82f6' }}>→ {fwdLinks.length} 個連結</span>
                )}
                {bkLinks.length > 0 && (
                    <span style={{ fontSize: 10, color: '#888' }}>← {bkLinks.length} 個引用</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 9, color: '#ccc' }}>
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {expanded && (
                <div
                    onPointerDown={e => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        bottom: '100%', left: 0, right: 0,
                        background: T.bgPanel,
                        border: `1px solid ${T.borderLight}`,
                        borderRadius: '12px 12px 0 0',
                        boxShadow: T.shadowUp,
                        maxHeight: 220,
                        overflowY: 'auto',
                        zIndex: 20,
                    }}
                >
                    {fwdLinks.length > 0 && (
                        <>
                            <div style={{
                                padding: '5px 12px 3px',
                                fontSize: 10, fontWeight: 600, color: '#3b82f6',
                                letterSpacing: '0.3px',
                            }}>
                                → 連結到
                            </div>
                            {fwdLinks.map(name => (
                                <div
                                    key={name}
                                    onPointerDown={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        emitAppEvent('jump-to-card', { targetName: name })
                                        setExpanded(false)
                                    }}
                                    style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 6 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = T.accentBg)}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ fontSize: 13 }}>📋</span> {name}
                                </div>
                            ))}
                        </>
                    )}

                    {bkLinks.length > 0 && (
                        <>
                            <div style={{
                                padding: '5px 12px 3px',
                                fontSize: 10, fontWeight: 600, color: '#888',
                                letterSpacing: '0.3px',
                                borderTop: fwdLinks.length > 0 ? `1px solid ${T.borderLight}` : 'none',
                            }}>
                                ← 被引用
                            </div>
                            {bkLinks.map(entry => (
                                <div
                                    key={`${entry.boardId}_${entry.shapeId}`}
                                    onPointerDown={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        emitAppEvent('jump-to-card', {
                                            boardId: entry.boardId,
                                            shapeId: entry.shapeId,
                                            x: entry.x,
                                            y: entry.y,
                                        })
                                        setExpanded(false)
                                    }}
                                    style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div style={{
                                        color: T.textPrimary, overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {entry.preview || '(無預覽)'}
                                    </div>
                                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                                        {entry.boardName}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
