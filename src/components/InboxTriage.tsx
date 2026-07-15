// src/components/InboxTriage.tsx
//
// Inbox Triage（N2）— 收件匣整理模式。
// 快速捕捉（Ctrl+Space）只有入口沒有出口，卡片堆在收件匣沒人清；
// 這裡補上 GTD 的 clarify 步驟：一次只看一張，只做一個決定，鍵盤全程可操作。
//
// 佇列與統計邏輯在 utils/inboxTriage.ts（純函式、有測試）；本檔只管顯示與鍵盤。

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { BoardRecord } from '../db'
import type { SnapshotShapeProps } from '../utils/snapshot'
import {
    buildTriageQueue, nextCursor, prevCursor, triageProgress, summarizeDecisions,
    type TriageDecision,
} from '../utils/inboxTriage'
import { TYPE_ICON, TYPE_LABEL, TYPE_COLOR, hexToRgba } from '../utils/cardMeta'
import { MoveCardModal } from './MoveCardModal'
import { Z_MODAL } from '../constants'

export interface InboxTriageProps {
    boards: BoardRecord[]
    onMoveCard: (shapeId: string, targetBoardId: string) => void
    onUpdateCardProps: (shapeId: string, patch: Partial<SnapshotShapeProps>) => void
    onTrashCard: (shapeId: string) => void
    onClose: () => void
    isDark: boolean
}

const kbdStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'monospace',
    border: '1px solid currentColor',
    opacity: 0.65,
    marginLeft: 6,
}

export function InboxTriage({ boards, onMoveCard, onUpdateCardProps, onTrashCard, onClose, isDark }: InboxTriageProps) {
    // 佇列只在開啟時建一次：處理途中 boards 會隨每個決策更新，跟著重算會讓卡片在眼前跳位
    const [queue] = useState(() => buildTriageQueue(boards.find(b => b.isInbox)?.snapshot ?? null))
    const [cursor, setCursor] = useState(0)
    const [decisions, setDecisions] = useState<Record<string, TriageDecision>>({})
    const [picking, setPicking] = useState(false)

    const total = queue.length
    const item = cursor < total ? queue[cursor] : null
    const done = cursor >= total
    const progress = triageProgress(cursor, total)
    const summary = useMemo(() => summarizeDecisions(decisions), [decisions])

    const decide = useCallback((decision: TriageDecision) => {
        if (!item) return
        setDecisions(prev => ({ ...prev, [item.shapeId]: decision }))
        setCursor(c => nextCursor(c, total))
    }, [item, total])

    const handleTask = useCallback(() => {
        if (!item) return
        onUpdateCardProps(item.shapeId, { cardStatus: 'todo' })
        decide('task')
    }, [item, onUpdateCardProps, decide])

    const handleTrash = useCallback(() => {
        if (!item) return
        onTrashCard(item.shapeId)
        decide('deleted')
    }, [item, onTrashCard, decide])

    const handlePick = useCallback((targetBoardId: string) => {
        if (!item) return
        onMoveCard(item.shapeId, targetBoardId)
        setPicking(false)
        decide('moved')
    }, [item, onMoveCard, decide])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // 選白板時鍵盤讓給 MoveCardModal（它自己處理 Esc）
            if (picking) return
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
            if (done) {
                if (e.key === 'Enter') { e.preventDefault(); onClose() }
                return
            }
            const k = e.key.toLowerCase()
            if (k === 'm') { e.preventDefault(); setPicking(true) }
            else if (k === 't') { e.preventDefault(); handleTask() }
            else if (k === 'k') { e.preventDefault(); decide('kept') }
            else if (k === 'd') { e.preventDefault(); handleTrash() }
            else if (k === 's' || e.key === 'ArrowRight') { e.preventDefault(); setCursor(c => nextCursor(c, total)) }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor(prevCursor) }
        }
        window.addEventListener('keydown', handler, true)
        return () => window.removeEventListener('keydown', handler, true)
    }, [picking, done, total, onClose, handleTask, handleTrash, decide])

    const bg = isDark ? '#1e293b' : '#ffffff'
    const border = isDark ? '#334155' : 'rgba(0,0,0,0.08)'
    const textColor = isDark ? '#e2e8f0' : '#0f172a'
    const mutedColor = isDark ? '#94a3b8' : '#64748b'
    const hintColor = isDark ? '#475569' : '#94a3b8'
    const cardBg = isDark ? '#0f172a' : '#f8fafc'
    const trackBg = isDark ? '#334155' : '#e2e8f0'

    const actionBtn = (label: string, hint: string, color: string, onClick: () => void): React.ReactNode => (
        <button
            onClick={onClick}
            style={{
                flex: 1, padding: '10px 0', borderRadius: 9,
                border: `1px solid ${color}`, background: hexToRgba(color, isDark ? 0.18 : 0.09),
                color, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
        >
            {label}<kbd style={kbdStyle}>{hint}</kbd>
        </button>
    )

    return (
        <>
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: Z_MODAL,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)',
                }}
                // MoveCardModal 的遮罩（Z_MODAL_BACKDROP）疊在本層之下，選白板時點空白會打到這裡；
                // 此時只取消選取，不關掉整個整理模式
                onClick={() => picking ? setPicking(false) : onClose()}
            >
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: 560, borderRadius: 14, background: bg,
                        border: `1px solid ${border}`,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
                        padding: '16px 18px 14px',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    }}
                >
                    {/* 標題 + 進度 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: mutedColor }}>
                            📥 收件匣整理
                        </div>
                        <div style={{ fontSize: 12, color: mutedColor }}>
                            {total === 0 ? '收件匣是空的' : `${progress.current} / ${progress.total}`}
                        </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: trackBg, overflow: 'hidden' }}>
                        <div style={{ width: `${progress.percent}%`, height: '100%', background: '#2563eb', transition: 'width 0.2s' }} />
                    </div>

                    {done ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 0 6px', textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: textColor }}>
                                {total === 0 ? '收件匣已經清空了 🎉' : '整理完成 🎉'}
                            </div>
                            {total > 0 && (
                                <div style={{ fontSize: 13, color: mutedColor, lineHeight: 1.9 }}>
                                    移到白板 {summary.moved} 張 ・ 標為任務 {summary.task} 張<br />
                                    保留 {summary.kept} 張 ・ 刪除 {summary.deleted} 張
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                style={{
                                    alignSelf: 'center', marginTop: 4, padding: '8px 28px', borderRadius: 9,
                                    border: 'none', background: '#2563eb', color: 'white',
                                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                }}
                            >
                                完成<kbd style={kbdStyle}>Enter</kbd>
                            </button>
                        </div>
                    ) : item && (
                        <>
                            {/* 卡片預覽 */}
                            <div style={{
                                background: cardBg, border: `1px solid ${border}`, borderRadius: 10,
                                padding: '14px 16px', minHeight: 190,
                                display: 'flex', flexDirection: 'column', gap: 8,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                                        color: TYPE_COLOR[item.type],
                                        background: hexToRgba(TYPE_COLOR[item.type], isDark ? 0.2 : 0.1),
                                    }}>
                                        {TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}
                                    </span>
                                    {item.tags.map(tag => (
                                        <span key={tag} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: trackBg, color: mutedColor }}>
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                                {item.title && (
                                    <div style={{ fontSize: 15, fontWeight: 600, color: textColor }}>{item.title}</div>
                                )}
                                <div style={{
                                    fontSize: 13, lineHeight: 1.7, color: mutedColor,
                                    whiteSpace: 'pre-wrap', overflow: 'hidden',
                                }}>
                                    {item.preview || (item.title ? '' : '（空白卡片）')}
                                </div>
                            </div>

                            {/* 決策 */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                {actionBtn('移到白板', 'M', '#2563eb', () => setPicking(true))}
                                {actionBtn('標為任務', 'T', '#16a34a', handleTask)}
                                {actionBtn('保留', 'K', '#64748b', () => decide('kept'))}
                                {actionBtn('刪除', 'D', '#dc2626', handleTrash)}
                            </div>

                            <div style={{ fontSize: 11.5, color: hintColor, display: 'flex', justifyContent: 'space-between' }}>
                                <span>
                                    <kbd style={{ ...kbdStyle, marginLeft: 0 }}>←</kbd> 上一張
                                    <kbd style={kbdStyle}>→ / S</kbd> 略過
                                </span>
                                <span><kbd style={{ ...kbdStyle, marginLeft: 0 }}>Esc</kbd> 關閉</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {picking && item && (
                <MoveCardModal
                    boards={boards}
                    onSelect={handlePick}
                    onClose={() => setPicking(false)}
                    isDark={isDark}
                />
            )}
        </>
    )
}
