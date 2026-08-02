// src/BackupPanel.tsx
import { useState, useEffect } from 'react'
import { loadBackups, deleteBackup, type BackupRecord, type BoardRecord } from './db'
import { Z_PANEL, Z_BACKUP_PANEL } from './constants'
import { canSaveImage } from './platform/imageStore'
import { getBackupLimit } from './utils/backupSettings'
import { T } from './theme/tokens'
import { SideDrawer } from './components/ui/SideDrawer'
import { Icon } from './components/ui/icons'
import { isSyncConfigured } from './sync/syncConfig'

interface BackupPanelProps {
    sidebarWidth: number
    onClose: () => void
    onRestore: (boards: BoardRecord[]) => void
    /** 立即把所有白板的舊 base64 圖片遷移成存檔格式；回傳遷移的白板數。 */
    onMigrateImages?: () => Promise<number>
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

export function BackupPanel({ sidebarWidth, onClose, onRestore, onMigrateImages }: BackupPanelProps) {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmRestore, setConfirmRestore] = useState<BackupRecord | null>(null)
    const [migrateState, setMigrateState] = useState<'idle' | 'running' | 'done'>('idle')
    const [migrateResult, setMigrateResult] = useState<number>(0)
    const canMigrate = !!onMigrateImages && canSaveImage()

    const handleMigrate = async () => {
        if (!onMigrateImages || migrateState === 'running') return
        setMigrateState('running')
        try {
            const n = await onMigrateImages()
            setMigrateResult(n)
            setMigrateState('done')
            const all = await loadBackups()
            setBackups(all)
        } catch (err) {
            console.error('圖片遷移失敗', err)
            setMigrateState('idle')
        }
    }

    useEffect(() => {
        loadBackups().then(all => { setBackups(all); setLoading(false) })
    }, [])

    // 只有真的設定過雲端同步的人才需要看到「備份裡沒有的板會被拉回來」那段警語
    const syncEnabled = isSyncConfigured()

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

    // 抽屜外框／標題列／關閉鈕由 SideDrawer 提供
    const borderCol   = T.borderLight
    const headerBorder = T.borderLight
    const titleColor  = T.textPrimary
    const rowBorder   = T.borderLight
    const hoverBg     = T.bgHover
    const restoreBtnBg     = T.bgPanel
    const restoreBtnBorder = T.borderMid
    const restoreBtnColor  = T.textPrimary
    const dialogBg    = T.bgPanel
    const cancelBg    = T.bgPanel
    const cancelBorder = T.borderLight

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: Z_PANEL - 1 }} />

            {confirmRestore && (
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: Z_BACKUP_PANEL }} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%',
                        transform: 'translate(-50%,-50%)',
                        background: dialogBg, borderRadius: 14, padding: 24,
                        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
                        zIndex: Z_BACKUP_PANEL + 1, width: 320,
                        border: `1px solid ${borderCol}`,
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: titleColor, display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Icon name="toastError" size="md" />確認還原備份
                        </div>
                        <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
                            還原至 <strong>{formatFull(confirmRestore.timestamp)}</strong> 的備份。
                            <br /><br />
                            <span style={{ color: '#e03131', fontWeight: 500 }}>還原後目前所有白板資料會被覆蓋，此操作無法復原。</span>
                            {syncEnabled && (
                                <>
                                    <br /><br />
                                    你開了雲端同步：<strong>備份裡沒有、但雲端有的白板會被拉回來</strong>，
                                    不會被從雲端刪掉。真的要清掉它們請還原後再手動刪除。
                                </>
                            )}
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

            <SideDrawer
                title="自動備份" titleIcon="backup"
                // 這個抽屜刻意不貼齊右邊界：它從側邊欄的選單開啟，蓋住側邊欄會看不到來源
                offsetRight={sidebarWidth}
                onClose={onClose}
                bodyPadding={0}
                headerExtra={(
                    /* N17：保留份數改為可設定，這裡不能再寫死「5 份」 */
                    <div style={{ fontSize: 11, color: T.textMuted }}>
                        共 {backups.length} 份備份，最多保留 {getBackupLimit()} 份
                    </div>
                )}
                footer={(
                    <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
                        備份在切換白板或關閉 App 時自動建立（每 5 分鐘最多一次）
                    </div>
                )}
            >
                <div>
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
                                    background: idx === 0 ? (T.successBg) : 'transparent',
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

                {canMigrate && (
                    <div style={{ padding: '10px 16px', borderTop: `1px solid ${headerBorder}`, flexShrink: 0 }}>
                        <button
                            onClick={handleMigrate}
                            disabled={migrateState === 'running'}
                            style={{
                                width: '100%', padding: '8px', borderRadius: 8,
                                border: `1px solid ${restoreBtnBorder}`, background: restoreBtnBg,
                                cursor: migrateState === 'running' ? 'default' : 'pointer',
                                fontSize: 12, fontWeight: 500, color: restoreBtnColor,
                            }}
                            onMouseEnter={e => { if (migrateState !== 'running') e.currentTarget.style.background = hoverBg }}
                            onMouseLeave={e => (e.currentTarget.style.background = restoreBtnBg)}
                        >
                            {migrateState === 'running' ? '遷移中…' : '🗜️ 立即遷移舊圖片為存檔'}
                        </button>
                        <div style={{ fontSize: 11, color: '#bbb', marginTop: 6, lineHeight: 1.5 }}>
                            {migrateState === 'done'
                                ? `完成：已遷移 ${migrateResult} 個白板的圖片`
                                : '把舊的內嵌 base64 圖片改存成檔案，縮小資料庫與備份體積'}
                        </div>
                    </div>
                )}

            </SideDrawer>
        </>
    )
}
