// src/BackupPanel.tsx
import { useState, useEffect } from 'react'
import { loadBackups, deleteBackup, type BackupRecord, type BoardRecord } from './db'

interface BackupPanelProps {
    sidebarWidth: number
    onClose: () => void
    onRestore: (boards: BoardRecord[]) => void
    isDark: boolean
}

function formatDate(ts: number): string {
    const d = new Date(ts)
    const diffMs = Date.now() - ts
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr  = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)
    if (diffMin < 1) return '剛剛'
    if (diffMin < 60) return `${diffMin} 分鐘前`
    if (diffHr < 24) return `${diffHr} 小時前`
    if (diffDay < 7) return `${diffDay} 天前`
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatFull(ts: number): string {
    const d = new Date(ts)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function BackupPanel({ sidebarWidth, onClose, onRestore, isDark }: BackupPanelProps) {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmRestore, setConfirmRestore] = useState<BackupRecord | null>(null)

    useEffect(() => {
        loadBackups().then(all => { setBackups(all); setLoading(false) })
    }, [])

    const handleRestore = async () => {
        if (!confirmRestore) return
        setRestoringId(confirmRestore.id)
        setConfirmRestore(null)
        onRestore(confirmRestore.boards)
        setRestoringId(null)
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        await deleteBackup(id)
        setBackups(prev => prev.filter(b => b.id !== id))
        setDeletingId(null)
    }

    const panelBg     = isDark ? '#1e293b' : 'white'
    const borderCol   = isDark ? '#334155' : '#e8e8e8'
    const headerBorder = isDark ? '#334155' : '#f0f0f0'
    const titleColor  = isDark ? '#e2e8f0' : '#1a1a1a'
    const rowBorder   = isDark ? '#334155' : '#f5f5f5'
    const hoverBg     = isDark ? '#243447' : '#f5f5f5'
    const restoreBtnBg     = isDark ? '#243447' : 'white'
    const restoreBtnBorder = isDark ? '#334155' : '#d1d5db'
    const restoreBtnColor  = isDark ? '#e2e8f0' : '#374151'
    const dialogBg    = isDark ? '#1e293b' : 'white'
    const cancelBg    = isDark ? '#243447' : 'white'
    const cancelBorder = isDark ? '#334155' : '#e0e0e0'

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 19998 }} />

            {confirmRestore && (
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 29999 }} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%',
                        transform: 'translate(-50%,-50%)',
                        background: dialogBg, borderRadius: 14, padding: 24,
                        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
                        zIndex: 30000, width: 320,
                        border: `1px solid ${borderCol}`,
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: titleColor }}>⚠️ 確認還原備份</div>
                        <div style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#555', lineHeight: 1.6, marginBottom: 16 }}>
                            還原至 <strong>{formatFull(confirmRestore.timestamp)}</strong> 的備份。
                            <br /><br />
                            <span style={{ color: '#e03131', fontWeight: 500 }}>還原後目前所有白板資料會被覆蓋，此操作無法復原。</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => setConfirmRestore(null)}
                                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${cancelBorder}`, background: cancelBg, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: titleColor }}
                            >取消</button>
                            <button
                                onClick={handleRestore}
                                style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#e03131', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                            >確認還原</button>
                        </div>
                    </div>
                </>
            )}

            <div style={{
                position: 'fixed', top: 0, right: sidebarWidth, width: 320, bottom: 0,
                background: panelBg, borderLeft: `1px solid ${borderCol}`,
                boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
                zIndex: 19999, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${headerBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: titleColor }}>🔒 自動備份</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>共 {backups.length} 份備份，最多保留 30 份</div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${borderCol}`, background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>載入中...</div>
                    ) : backups.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                            <div style={{ fontSize: 13, color: '#aaa' }}>尚無備份</div>
                            <div style={{ fontSize: 11, color: '#ccc', marginTop: 6, lineHeight: 1.5 }}>切換白板或關閉 App 時會自動建立備份</div>
                        </div>
                    ) : (
                        backups.map((backup, idx) => (
                            <div
                                key={backup.id}
                                style={{
                                    padding: '12px 16px', borderBottom: `1px solid ${rowBorder}`,
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    background: idx === 0 ? (isDark ? '#1a2e1a' : '#f8fff8') : 'transparent',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                        {idx === 0 && (
                                            <span style={{ fontSize: 9, fontWeight: 700, background: '#22c55e', color: 'white', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>最新</span>
                                        )}
                                        <span style={{ fontSize: 13, fontWeight: 500, color: titleColor }}>{formatDate(backup.timestamp)}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: '#aaa' }}>{formatFull(backup.timestamp)} · {backup.boardCount} 個白板</div>
                                </div>

                                <button
                                    onClick={() => handleDelete(backup.id)}
                                    disabled={deletingId === backup.id || restoringId !== null}
                                    title="刪除此備份"
                                    style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${borderCol}`, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.color = '#e03131'; e.currentTarget.style.borderColor = '#fca5a5' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = borderCol }}
                                >
                                    {deletingId === backup.id ? '…' : '×'}
                                </button>

                                <button
                                    onClick={() => setConfirmRestore(backup)}
                                    disabled={restoringId !== null}
                                    style={{
                                        padding: '5px 10px', borderRadius: 8,
                                        border: `1px solid ${restoreBtnBorder}`, background: restoreBtnBg,
                                        cursor: 'pointer', fontSize: 12, fontWeight: 500, color: restoreBtnColor,
                                        flexShrink: 0, whiteSpace: 'nowrap', transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                                    onMouseLeave={e => (e.currentTarget.style.background = restoreBtnBg)}
                                >
                                    {restoringId === backup.id ? '還原中…' : '還原'}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ padding: '10px 16px', borderTop: `1px solid ${headerBorder}`, flexShrink: 0, fontSize: 11, color: '#bbb', lineHeight: 1.6 }}>
                    備份在切換白板或關閉 App 時自動建立（每 5 分鐘最多一次）
                </div>
            </div>
        </>
    )
}
