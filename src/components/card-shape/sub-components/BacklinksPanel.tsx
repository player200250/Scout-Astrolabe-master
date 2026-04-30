import { useState, useContext } from 'react'
import { useIsDarkMode } from '@tldraw/editor'
import { BacklinksContext, extractCardName, type BacklinkEntry } from '../../../hooks/useBacklinks'

interface BacklinksPanelProps {
    shapeId: string
    htmlContent: string
}

export function BacklinksPanel({ shapeId, htmlContent }: BacklinksPanelProps) {
    const { forwardLinks, backlinks, currentBoardName } = useContext(BacklinksContext)
    const isDark = useIsDarkMode()
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
                    background: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.94)',
                    backdropFilter: 'blur(4px)',
                    borderTop: `1px solid ${isDark ? '#334155' : '#e8e8e8'}`,
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
                        background: isDark ? '#1e293b' : 'white',
                        border: `1px solid ${isDark ? '#334155' : '#e8e8e8'}`,
                        borderRadius: '12px 12px 0 0',
                        boxShadow: isDark ? '0 -4px 20px rgba(0,0,0,0.4)' : '0 -4px 20px rgba(0,0,0,0.1)',
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
                                        window.dispatchEvent(new CustomEvent('jump-to-card', {
                                            detail: { targetName: name }
                                        }))
                                        setExpanded(false)
                                    }}
                                    style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 6 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#1e3a5f' : '#eff6ff')}
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
                                borderTop: fwdLinks.length > 0 ? `1px solid ${isDark ? '#334155' : '#f5f5f5'}` : 'none',
                            }}>
                                ← 被引用
                            </div>
                            {bkLinks.map(entry => (
                                <div
                                    key={`${entry.boardId}_${entry.shapeId}`}
                                    onPointerDown={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        window.dispatchEvent(new CustomEvent('jump-to-card', {
                                            detail: {
                                                boardId: entry.boardId,
                                                shapeId: entry.shapeId,
                                                x: entry.x,
                                                y: entry.y,
                                            }
                                        }))
                                        setExpanded(false)
                                    }}
                                    style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#243447' : '#f7f7f7')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div style={{
                                        color: isDark ? '#e2e8f0' : '#1a1a1a', overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {entry.preview || '(無預覽)'}
                                    </div>
                                    <div style={{ fontSize: 10, color: isDark ? '#64748b' : '#bbb', marginTop: 2 }}>
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
