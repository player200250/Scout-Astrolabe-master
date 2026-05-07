import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from './db'
import type { BoardRecord, DeletedCardRecord } from './db'
import { saveBoard, deleteBoard } from './utils/boardDb'

interface TrashPanelProps {
    onClose: () => void
    onRestoreBoard: (id: string) => void
    onPermanentDeleteBoard: (id: string) => void
    onEmptyTrash: () => void
    onCardRestored: () => void
    isDark: boolean
}

type Tab = 'cards' | 'boards'

function relativeTime(ts: number): string {
    const diff = Date.now() - ts
    const days = Math.floor(diff / 86400000)
    if (days === 0) return '今天'
    if (days === 1) return '1 天前'
    return `${days} 天前`
}

function daysLeft(ts: number): number {
    return Math.max(0, 14 - Math.floor((Date.now() - ts) / 86400000))
}

export function TrashPanel({
    onClose,
    onRestoreBoard,
    onPermanentDeleteBoard,
    onEmptyTrash,
    onCardRestored,
    isDark,
}: TrashPanelProps) {
    const [tab, setTab] = useState<Tab>('cards')
    const [deletedCards, setDeletedCards] = useState<DeletedCardRecord[]>([])
    const [deletedBoards, setDeletedBoards] = useState<BoardRecord[]>([])
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
    const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const bg      = isDark ? '#0f172a' : '#f8f8f7'
    const panelBg = isDark ? '#1e293b' : '#ffffff'
    const text    = isDark ? '#e2e8f0' : '#1a1a1a'
    const muted   = isDark ? '#64748b' : '#999'
    const border  = isDark ? '#334155' : '#e8e8e6'
    const hoverBg = isDark ? '#334155' : '#f1f5f9'
    const tabActive = isDark ? '#e2e8f0' : '#1a1a1a'
    const tabInactive = isDark ? '#64748b' : '#aaa'

    const requestConfirm = useCallback((id: string) => {
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
        setConfirmingDeleteId(id)
        confirmTimerRef.current = setTimeout(() => setConfirmingDeleteId(null), 2000)
    }, [])

    const cancelConfirm = useCallback(() => {
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
        setConfirmingDeleteId(null)
    }, [])

    useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }, [])

    const load = useCallback(async () => {
        try {
            const cards: DeletedCardRecord[] = await db.table('deletedCards').orderBy('deletedAt').reverse().toArray()
            setDeletedCards(cards)
        } catch { setDeletedCards([]) }
        try {
            const boards: BoardRecord[] = await db.table('boards').where('deletedAt').above(0).toArray()
            boards.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
            setDeletedBoards(boards)
        } catch { setDeletedBoards([]) }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const handleRestoreCard = useCallback(async (record: DeletedCardRecord) => {
        try {
            await db.table('deletedCards').delete(record.id)
            setDeletedCards(prev => prev.filter(c => c.id !== record.id))
            onCardRestored()
            // Dispatch an event so the active editor can re-add the shape if on the same board
            window.dispatchEvent(new CustomEvent('restore-deleted-card', { detail: record }))
        } catch (err) {
            console.error('[Trash] 還原卡片失敗', err)
        }
    }, [onCardRestored])

    const handlePermanentDeleteCard = useCallback(async (id: string) => {
        const record = deletedCards.find(c => c.id === id)
        if (record) {
            window.dispatchEvent(new CustomEvent('permanent-delete-shape', {
                detail: { shapeId: record.shapeId, boardId: record.boardId },
            }))
        }
        await db.table('deletedCards').delete(id)
        setDeletedCards(prev => prev.filter(c => c.id !== id))
        window.dispatchEvent(new CustomEvent('trash-count-changed'))
    }, [deletedCards])

    const handleRestoreBoardLocal = useCallback(async (id: string) => {
        await db.table('boards').update(id, { deletedAt: undefined })
        await onRestoreBoard(id)
        setDeletedBoards(prev => prev.filter(b => b.id !== id))
    }, [onRestoreBoard])

    const handlePermanentDeleteBoardLocal = useCallback((id: string) => {
        onPermanentDeleteBoard(id)
        setDeletedBoards(prev => prev.filter(b => b.id !== id))
    }, [onPermanentDeleteBoard])

    const handleEmptyTrashLocal = useCallback(async () => {
        cancelConfirm()
        for (const card of deletedCards) {
            window.dispatchEvent(new CustomEvent('permanent-delete-shape', {
                detail: { shapeId: card.shapeId, boardId: card.boardId },
            }))
        }
        await onEmptyTrash()
        setDeletedCards([])
        setDeletedBoards([])
    }, [onEmptyTrash, deletedCards])

    const totalCount = deletedCards.length + deletedBoards.length

    const cardTypeLabel: Record<string, string> = {
        text: '文字', todo: '待辦', link: '連結', image: '圖片', board: '白板卡', journal: '日誌',
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50000,
            background: bg,
            display: 'flex', flexDirection: 'column',
        }}>
            <style>{`@keyframes trashConfirmIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }`}</style>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '16px 24px', borderBottom: `1px solid ${border}`,
                background: panelBg, flexShrink: 0,
            }}>
                <button
                    onClick={onClose}
                    style={{
                        width: 32, height: 32, borderRadius: 8,
                        border: `1px solid ${border}`,
                        background: 'transparent', cursor: 'pointer',
                        fontSize: 16, color: muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >×</button>
                <span style={{ fontSize: 18, fontWeight: 700, color: text }}>🗑️ 垃圾桶</span>
                <span style={{
                    fontSize: 11, background: isDark ? '#334155' : '#f1f5f9',
                    color: muted, borderRadius: 99, padding: '2px 8px',
                }}>
                    {totalCount} 個項目
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: muted }}>項目在 14 天後自動永久刪除</span>
                {totalCount > 0 && (
                    confirmingDeleteId === '__empty__' ? (
                        <div style={{ display: 'flex', gap: 6, animation: 'trashConfirmIn 0.15s ease' }}>
                            <button
                                onClick={handleEmptyTrashLocal}
                                style={{
                                    padding: '7px 14px', borderRadius: 8, border: 'none',
                                    background: '#dc2626', color: 'white',
                                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                }}
                            >確認清空</button>
                            <button
                                onClick={cancelConfirm}
                                style={{
                                    padding: '7px 12px', borderRadius: 8,
                                    border: `1px solid ${border}`,
                                    background: 'transparent', cursor: 'pointer',
                                    fontSize: 13, color: muted,
                                }}
                            >取消</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => requestConfirm('__empty__')}
                            style={{
                                padding: '7px 14px', borderRadius: 8, border: 'none',
                                background: isDark ? '#3f1f1f' : '#fee2e2',
                                color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            }}
                        >
                            清空垃圾桶
                        </button>
                    )
                )}
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', borderBottom: `1px solid ${border}`,
                padding: '0 24px', background: panelBg, flexShrink: 0,
            }}>
                {(['cards', 'boards'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '10px 16px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 14,
                            color: tab === t ? tabActive : tabInactive,
                            fontWeight: tab === t ? 600 : 400,
                            borderBottom: tab === t ? `2px solid #3b82f6` : '2px solid transparent',
                            marginBottom: -1,
                        }}
                    >
                        {t === 'cards' ? `卡片 (${deletedCards.length})` : `白板 (${deletedBoards.length})`}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                {tab === 'cards' && (
                    deletedCards.length === 0
                        ? <Empty isDark={isDark} label="沒有已刪除的卡片" />
                        : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {deletedCards.map(card => (
                                    <div key={card.id} style={{
                                        background: panelBg, borderRadius: 10,
                                        border: `1px solid ${border}`,
                                        padding: '12px 16px',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                                            background: isDark ? '#334155' : '#f1f5f9',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 18,
                                        }}>
                                            {card.type === 'text' ? '📝' : card.type === 'todo' ? '✅'
                                                : card.type === 'link' ? '🔗' : card.type === 'image' ? '🖼️'
                                                : card.type === 'journal' ? '📔' : '📄'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 13, fontWeight: 500, color: text,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {card.preview || '（無內容）'}
                                            </div>
                                            <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                                                {cardTypeLabel[card.type] ?? card.type} · 來自《{card.boardName}》· {relativeTime(card.deletedAt)} 刪除 · 剩 {daysLeft(card.deletedAt)} 天
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button
                                                onClick={() => handleRestoreCard(card)}
                                                style={{
                                                    padding: '6px 12px', borderRadius: 7,
                                                    border: `1px solid ${border}`,
                                                    background: 'transparent', cursor: 'pointer',
                                                    fontSize: 12, color: text,
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                ↩ 還原
                                            </button>
                                            {confirmingDeleteId === card.id ? (
                                                <div style={{ display: 'flex', gap: 4, animation: 'trashConfirmIn 0.15s ease' }}>
                                                    <button
                                                        onClick={() => { cancelConfirm(); handlePermanentDeleteCard(card.id) }}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: 7, border: 'none',
                                                            background: '#dc2626', color: 'white',
                                                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                        }}
                                                    >確認刪除</button>
                                                    <button
                                                        onClick={cancelConfirm}
                                                        style={{
                                                            padding: '6px 8px', borderRadius: 7,
                                                            border: `1px solid ${border}`,
                                                            background: 'transparent', cursor: 'pointer',
                                                            fontSize: 12, color: muted,
                                                        }}
                                                    >取消</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => requestConfirm(card.id)}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 7,
                                                        border: 'none',
                                                        background: isDark ? '#3f1f1f' : '#fee2e2',
                                                        cursor: 'pointer', fontSize: 12, color: '#dc2626',
                                                    }}
                                                >
                                                    永久刪除
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                )}

                {tab === 'boards' && (
                    deletedBoards.length === 0
                        ? <Empty isDark={isDark} label="沒有已刪除的白板" />
                        : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {deletedBoards.map(board => (
                                    <div key={board.id} style={{
                                        background: panelBg, borderRadius: 10,
                                        border: `1px solid ${border}`,
                                        padding: '12px 16px',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}>
                                        <div style={{
                                            width: 48, height: 32, borderRadius: 6, flexShrink: 0,
                                            background: isDark ? '#334155' : '#f1f5f9',
                                            border: `1px solid ${border}`,
                                            overflow: 'hidden',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {board.thumbnail
                                                ? <img src={board.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                : <span style={{ fontSize: 8, color: muted }}>□</span>
                                            }
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{board.name}</div>
                                            <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                                                {relativeTime(board.deletedAt!)} 刪除 · 剩 {daysLeft(board.deletedAt!)} 天
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button
                                                onClick={() => handleRestoreBoardLocal(board.id)}
                                                style={{
                                                    padding: '6px 12px', borderRadius: 7,
                                                    border: `1px solid ${border}`,
                                                    background: 'transparent', cursor: 'pointer',
                                                    fontSize: 12, color: text,
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                ↩ 還原
                                            </button>
                                            {confirmingDeleteId === board.id ? (
                                                <div style={{ display: 'flex', gap: 4, animation: 'trashConfirmIn 0.15s ease' }}>
                                                    <button
                                                        onClick={() => { cancelConfirm(); handlePermanentDeleteBoardLocal(board.id) }}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: 7, border: 'none',
                                                            background: '#dc2626', color: 'white',
                                                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                        }}
                                                    >確認刪除</button>
                                                    <button
                                                        onClick={cancelConfirm}
                                                        style={{
                                                            padding: '6px 8px', borderRadius: 7,
                                                            border: `1px solid ${border}`,
                                                            background: 'transparent', cursor: 'pointer',
                                                            fontSize: 12, color: muted,
                                                        }}
                                                    >取消</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => requestConfirm(board.id)}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 7,
                                                        border: 'none',
                                                        background: isDark ? '#3f1f1f' : '#fee2e2',
                                                        cursor: 'pointer', fontSize: 12, color: '#dc2626',
                                                    }}
                                                >
                                                    永久刪除
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                )}
            </div>

        </div>
    )
}

function Empty({ isDark, label }: { isDark: boolean; label: string }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: 240, gap: 12,
        }}>
            <span style={{ fontSize: 48 }}>🗑️</span>
            <span style={{ fontSize: 14, color: isDark ? '#64748b' : '#aaa' }}>{label}</span>
        </div>
    )
}

// Utility to save a shape to the deletedCards table
export async function saveCardToTrash(
    shapeId: string,
    shapeData: unknown,
    boardId: string,
    boardName: string,
    type: string,
    preview: string,
): Promise<void> {
    try {
        const record: DeletedCardRecord = {
            id: `dc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            shapeId,
            boardId,
            boardName,
            shapeData,
            deletedAt: Date.now(),
            type,
            preview,
        }
        await db.table('deletedCards').put(record)
    } catch (err) {
        console.error('[Trash] 儲存卡片失敗', err)
    }
}

// Extract a short preview string from a card shape
export function getCardPreview(shape: { props?: Record<string, unknown> }): string {
    const p = shape.props ?? {}
    if (p.type === 'text' || p.type === 'journal') {
        const html = String(p.text ?? '')
        return html.replace(/<[^>]+>/g, '').slice(0, 80) || '（空白文字卡片）'
    }
    if (p.type === 'todo') return String(p.text ?? '') || '待辦清單'
    if (p.type === 'link') return String(p.title ?? p.url ?? '連結卡片')
    if (p.type === 'image') return '圖片卡片'
    if (p.type === 'board') return `白板卡: ${String(p.text ?? '')}`
    return '卡片'
}
