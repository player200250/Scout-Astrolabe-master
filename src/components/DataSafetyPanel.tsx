import { useState, useEffect, useMemo } from 'react'
import type { BoardRecord, BackupRecord } from '../db'
import { loadBackups, trimBackups } from '../db'
import { computeVaultStats, formatBytes } from '../utils/dataSafetyStats'
import { BACKUP_LIMIT_OPTIONS, getBackupLimit, setBackupLimit } from '../utils/backupSettings'
import { showToast } from '../utils/toast'
import { T } from '../theme/tokens'
import { FullscreenPanel } from './ui/FullscreenPanel'
import { Icon } from './ui/icons'
import { isSyncConfigured } from '../sync/syncConfig'
import { getSyncStatus } from '../sync/syncEngine'
import { scanCloudLeftovers, cleanupCloudLeftovers, type CleanupPlan } from '../sync/cloudCleanup'
import { scanOrphanFiles, cleanupOrphanFiles } from '../utils/localCleanup'
import { canListStoredFiles } from '../platform/fileStore'
import type { OrphanFilePlan } from '../utils/orphanFiles'
import { canUseDiskBackup, getDiskBackupStatus, openDiskBackupDir, pickDiskBackup } from '../platform/backupFile'
import { formatRelativeDate } from '../utils/date'
import { Z_MODAL, Z_MODAL_BACKDROP } from '../constants'

interface DataSafetyPanelProps {
    boards: BoardRecord[]
    onClose: () => void
    onOpenBackup: () => void
    /** 從硬碟備份檔還原（走與 App 內備份相同的還原流程）。沒給就不顯示還原鈕 */
    onRestore?: (boards: BoardRecord[]) => Promise<void>
}

type DiskStatus = { dir: string; count: number; totalBytes: number; latest: number | null }
type PendingRestore = { fileName: string; boards: BoardRecord[]; timestamp: number | null; cardCount: number; imagesRestored: number }

const formatClock = (ts: number) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const TYPE_LABEL: Record<string, string> = {
    text: '文字', image: '圖片', todo: '待辦', link: '連結', board: '白板卡',
    journal: '日誌', heading: '標題', sticky: '便利貼', table: '表格',
    color: '顏色', file: '檔案',
}

export function DataSafetyPanel({ boards, onClose, onOpenBackup, onRestore }: DataSafetyPanelProps) {
    const [backups, setBackups] = useState<BackupRecord[]>([])

    // ── 硬碟備份（文件\Scout Astrolabe 備份）──────────────────────────────
    // 2026-10-05 事故後加的：App 內備份跟白板在同一個資料庫，資料庫沒了就一起沒了。
    const diskOn = canUseDiskBackup()
    const [diskStatus, setDiskStatus] = useState<DiskStatus | null>(null)
    const [diskBusy, setDiskBusy] = useState<'pick' | 'restore' | null>(null)
    const [diskError, setDiskError] = useState<string | null>(null)
    const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null)

    useEffect(() => {
        if (!diskOn) return
        let alive = true
        getDiskBackupStatus().then(s => { if (alive) setDiskStatus(s) }).catch(() => { /* 忽略 */ })
        return () => { alive = false }
    }, [diskOn])

    const handlePickBackup = async () => {
        setDiskBusy('pick'); setDiskError(null)
        try {
            const r = await pickDiskBackup()
            if (!r) return
            if (!r.ok) { setDiskError(`「${r.fileName}」無法還原：${r.error}`); return }
            setPendingRestore({ fileName: r.fileName, boards: r.boards, timestamp: r.timestamp, cardCount: r.cardCount, imagesRestored: r.imagesRestored })
        } catch (e) {
            setDiskError(`讀取備份檔失敗：${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setDiskBusy(null)
        }
    }

    const handleConfirmRestore = async () => {
        if (!pendingRestore || !onRestore) return
        setDiskBusy('restore')
        try {
            await onRestore(pendingRestore.boards)
            showToast(`已從「${pendingRestore.fileName}」還原 ${pendingRestore.boards.length} 塊白板`, 'success')
            setPendingRestore(null)
        } catch (e) {
            setDiskError(`還原失敗：${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setDiskBusy(null)
        }
    }
    const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
    const [backupLimit, setBackupLimitState] = useState(() => getBackupLimit())

    // ── 雲端殘留清理 ────────────────────────────────────────────────────
    // 刻意做成「掃描 → 看數字 → 按了才刪」：墓碑刪太早會讓別台把板復活，
    // 孤兒圖刪錯就是使用者的圖永久消失，兩件事都不該在背景靜默發生。
    const syncOn = isSyncConfigured()
    const [cleanupBusy, setCleanupBusy] = useState<'scan' | 'delete' | null>(null)
    const [plan, setPlan] = useState<CleanupPlan | null>(null)
    const [cleanupError, setCleanupError] = useState<string | null>(null)

    const handleScan = async () => {
        setCleanupBusy('scan'); setCleanupError(null); setPlan(null)
        const r = await scanCloudLeftovers()
        setCleanupBusy(null)
        if (!r.ok || !r.plan) { setCleanupError(r.error ?? '掃描失敗'); return }
        setPlan(r.plan)
    }

    const handleCleanup = async () => {
        if (!plan) return
        setCleanupBusy('delete'); setCleanupError(null)
        const r = await cleanupCloudLeftovers(plan)
        setCleanupBusy(null)
        if (!r.ok) { setCleanupError(r.error ?? '清理失敗'); return }
        setPlan(null)
        showToast(`已清掉 ${r.deletedTombstones} 列墓碑、${r.deletedImages} 個孤兒圖片。`, 'success')
    }

    // ── 本機孤兒實體檔清理（N10）─────────────────────────────────────────
    // 與雲端那組同一套節奏：掃描 → 看數字 → 按了才刪。這邊刪的是磁碟上的圖，
    // 沒有雲端那份可以回頭撈，所以掃描條件更保守（見 utils/orphanFiles.ts）。
    const canCleanFiles = canListStoredFiles()
    const [fileBusy, setFileBusy] = useState<'scan' | 'delete' | null>(null)
    const [filePlan, setFilePlan] = useState<OrphanFilePlan | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)

    const handleScanFiles = async () => {
        setFileBusy('scan'); setFileError(null); setFilePlan(null)
        const r = await scanOrphanFiles()
        setFileBusy(null)
        if (!r.ok || !r.plan) { setFileError(r.error ?? '掃描失敗'); return }
        setFilePlan(r.plan)
    }

    const handleCleanupFiles = async () => {
        if (!filePlan) return
        setFileBusy('delete'); setFileError(null)
        const r = await cleanupOrphanFiles(filePlan)
        setFileBusy(null)
        if (!r.ok) { setFileError(r.error ?? '清理失敗'); return }
        setFilePlan(null)
        showToast(`已刪掉 ${r.deletedFiles} 個孤兒檔，釋出約 ${formatBytes(r.freedBytes)}。`, 'success')
        try {
            const e = await navigator.storage?.estimate?.()
            if (e) setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 })
        } catch { /* 忽略 */ }
    }

    useEffect(() => {
        let alive = true
        loadBackups().then(bks => { if (alive) setBackups(bks) }).catch(() => { /* 忽略 */ })
        try {
            navigator.storage?.estimate?.().then(e => {
                if (alive) setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 })
            }).catch(() => { /* 忽略 */ })
        } catch { /* 忽略 */ }
        return () => { alive = false }
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const stats = useMemo(() => computeVaultStats(boards, backups), [boards, backups])

    // 每份備份的平均體積 → 用來估「保留 N 份大約會佔多少」。
    // 沒有備份時退回 0（估不出來就不要假裝估得出來）。
    const avgBackupBytes = backups.length > 0 ? stats.backups.bytes / backups.length : 0

    // 調小份數會**立刻刪掉**超額的舊備份，所以動作要當場做完、統計要跟著更新，
    // 不能只改設定等下次自動備份才生效（那會讓面板數字說謊）。
    const handleChangeLimit = async (next: number) => {
        const applied = setBackupLimit(next)
        setBackupLimitState(applied)
        try {
            const removed = await trimBackups()
            setBackups(await loadBackups())
            showToast(removed > 0
                ? `保留份數改為 ${applied} 份，已清掉 ${removed} 份最舊的備份`
                : `保留份數改為 ${applied} 份`)
        } catch {
            showToast('保留份數已改，但清理舊備份時出錯')
        }
    }

    // 外框與標題列由 FullscreenPanel 提供
    const cardBg = T.bgPanel
    const border = T.borderLight
    const textPrimary = T.textPrimary
    const textMuted = T.textSecondary
    const trackBg = T.bgApp

    const usagePct = estimate && estimate.quota > 0
        ? Math.min(100, (estimate.usage / estimate.quota) * 100)
        : null

    const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
        <div style={{ background: trackBg, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: textPrimary, lineHeight: 1.1 }}>{value}</span>
            <span style={{ fontSize: 12, color: textMuted }}>{label}</span>
            {hint && <span style={{ fontSize: 11, color: textMuted, opacity: 0.8 }}>{hint}</span>}
        </div>
    )

    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: textMuted, marginBottom: 10, letterSpacing: '0.3px' }}>{title}</div>
            {children}
        </div>
    )

    const typeEntries = Object.entries(stats.cards.byType).sort((a, b) => b[1] - a[1])

    return (
        <FullscreenPanel
            title="資料安全中心" titleIcon="dataSafety"
            badge={<span style={{ background: trackBg, borderRadius: 6, padding: '2px 8px' }}>統計與備份設定</span>}
            onClose={onClose}
            padded={false}
        >
            <div style={{ padding: '22px 24px', maxWidth: 780, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                {/* 儲存總覽 */}
                <Section title="儲存用量（IndexedDB）">
                    {usagePct != null && estimate ? (
                        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                                <span style={{ fontSize: 20, fontWeight: 700, color: textPrimary }}>{formatBytes(estimate.usage)}</span>
                                <span style={{ fontSize: 12, color: textMuted }}>／ 可用約 {formatBytes(estimate.quota)}（{usagePct.toFixed(1)}%）</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: trackBg, overflow: 'hidden' }}>
                                <div style={{ width: `${usagePct}%`, height: '100%', background: usagePct > 80 ? '#ef4444' : usagePct > 50 ? '#f59e0b' : '#22c55e', transition: 'width 0.3s' }} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 13, color: textMuted }}>此環境無法取得儲存用量估算。</div>
                    )}
                </Section>

                {/* 白板 */}
                <Section title="白板">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                        <Stat label="一般白板" value={stats.boards.normal} />
                        <Stat label="已封存" value={stats.boards.archived} />
                        <Stat label="資料夾" value={stats.boards.folders} />
                    </div>
                </Section>

                {/* 卡片 */}
                <Section title={`卡片（共 ${stats.cards.total} 張）`}>
                    {typeEntries.length === 0 ? (
                        <div style={{ fontSize: 13, color: textMuted }}>尚無卡片。</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                            {typeEntries.map(([type, count]) => (
                                <Stat key={type} label={TYPE_LABEL[type] ?? type} value={count} />
                            ))}
                        </div>
                    )}
                </Section>

                {/* 體積明細 */}
                <Section title="體積明細（估算）">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                        <Stat label="圖片卡片" value={stats.imageCards} hint="改存實體檔，不佔 snapshot" />
                        <Stat label="整板縮圖" value={formatBytes(stats.thumbnailBytes)} hint="base64，另一體積源" />
                        <Stat label="白板快照" value={formatBytes(stats.snapshotBytes)} hint="含殘留 base64" />
                        <Stat label="自動備份" value={`${stats.backups.count} / ${backupLimit}`} hint={`約 ${formatBytes(stats.backups.bytes)}`} />
                    </div>
                </Section>

                {/* 備份保留份數（N17） */}
                <Section title="備份保留份數">
                    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {BACKUP_LIMIT_OPTIONS.map(opt => {
                                const active = opt === backupLimit
                                return (
                                    <button
                                        key={opt}
                                        onClick={() => { void handleChangeLimit(opt) }}
                                        style={{
                                            minWidth: 64, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                                            fontSize: 13, fontWeight: active ? 600 : 500,
                                            border: `1px solid ${active ? T.accentBorder : border}`,
                                            background: active ? T.accentBg : 'transparent',
                                            color: active ? T.accent : textPrimary,
                                        }}
                                    >{opt} 份</button>
                                )
                            })}
                        </div>
                        <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.7 }}>
                            每份備份是<strong>全部白板</strong>的完整複製。
                            {avgBackupBytes > 0 && (
                                <>目前平均每份約 {formatBytes(avgBackupBytes)}，保留 {backupLimit} 份約需 {formatBytes(avgBackupBytes * backupLimit)}。</>
                            )}
                            <br />
                            份數調小會立刻刪掉最舊的備份；調大則要留意用量——備份過多曾經撐爆 IndexedDB 造成白屏，這也是上限只開到 20 的原因。
                        </div>
                    </div>
                </Section>

                {/* 硬碟備份（2026-10-05 事故後） */}
                {diskOn && (
                    <Section title="硬碟備份">
                        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 18px' }}>
                            <div style={{ fontSize: 12, color: textMuted, marginBottom: 6, wordBreak: 'break-all' }}>
                                <code>{diskStatus?.dir ?? '文件\\Scout Astrolabe 備份'}</code>
                            </div>
                            {diskStatus && diskStatus.count > 0 && diskStatus.latest ? (
                                <div style={{ fontSize: 14, color: textPrimary, lineHeight: 1.7, marginBottom: 12 }}>
                                    最後一份：<strong>{formatRelativeDate(diskStatus.latest)}</strong>（{formatClock(diskStatus.latest)}）
                                    <br />
                                    共 {diskStatus.count} 份・{formatBytes(diskStatus.totalBytes)}（含圖片）
                                </div>
                            ) : (
                                <div style={{ fontSize: 13, color: textMuted, marginBottom: 12 }}>
                                    還沒有硬碟備份。切換白板或把 App 縮小時會自動建立。
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                <button
                                    onClick={() => { void openDiskBackupDir() }}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '7px 14px', borderRadius: 8,
                                        border: `1px solid ${border}`, background: 'transparent',
                                        color: textPrimary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                    }}
                                >
                                    <Icon name="folder" />開啟資料夾
                                </button>
                                {onRestore && (
                                    <button
                                        onClick={() => { void handlePickBackup() }}
                                        disabled={diskBusy !== null}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '7px 14px', borderRadius: 8,
                                            border: `1px solid ${border}`, background: 'transparent',
                                            color: textPrimary, fontSize: 13, fontWeight: 500,
                                            cursor: diskBusy ? 'default' : 'pointer',
                                        }}
                                    >
                                        <Icon name="backup" />{diskBusy === 'pick' ? '讀取中…' : '從備份檔還原…'}
                                    </button>
                                )}
                            </div>
                            <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.7 }}>
                                放在 App 資料夾<strong>之外</strong>，App 的資料被清掉或解除安裝也還在。
                                約每小時存一份，保留最近 24 份＋每天一份（30 天）；
                                硬碟剩不到 2 GB 時會暫停，不會把電腦塞滿。
                            </div>
                            {diskError && (
                                <div style={{ marginTop: 10, fontSize: 12, color: T.danger, lineHeight: 1.6 }}>{diskError}</div>
                            )}
                        </div>
                    </Section>
                )}

                {/* 雲端殘留清理 */}
                {syncOn && (
                    <Section title="雲端殘留">
                        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 18px' }}>
                            <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.7, marginBottom: 12 }}>
                                白板永久刪除後，雲端會留一列<strong>墓碑</strong>（讓另一台知道它沒了）；
                                卡片刪掉後，Storage 裡那張<strong>圖片</strong>也沒人再引用。兩者都不會自己消失。
                                <br />
                                ⚠️ 判斷「還有沒有人引用」用的是<strong>本機的白板</strong>，所以請先確認同步是完成的狀態再清理。
                            </div>

                            {plan ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                                        <Stat label="可清墓碑" value={plan.tombstones.length} hint="刪除超過 60 天" />
                                        <Stat label="孤兒圖片" value={plan.orphanImages.length} hint="沒有卡片引用" />
                                    </div>
                                    {plan.tombstones.length + plan.orphanImages.length === 0 ? (
                                        <div style={{ fontSize: 13, color: textMuted }}>雲端很乾淨，沒有可以清掉的東西。</div>
                                    ) : (
                                        <button
                                            onClick={() => { void handleCleanup() }}
                                            disabled={cleanupBusy !== null}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '7px 14px', borderRadius: 8, border: 'none',
                                                background: T.danger, color: 'white', fontSize: 13, fontWeight: 600,
                                                cursor: cleanupBusy ? 'default' : 'pointer',
                                            }}
                                        >
                                            <Icon name="trash" />
                                            {cleanupBusy === 'delete' ? '清理中…' : '確認清理（無法復原）'}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => { void handleScan() }}
                                    disabled={cleanupBusy !== null || getSyncStatus().phase === 'syncing'}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '7px 14px', borderRadius: 8,
                                        border: `1px solid ${border}`, background: 'transparent',
                                        color: textPrimary, fontSize: 13, fontWeight: 500,
                                        cursor: cleanupBusy ? 'default' : 'pointer',
                                    }}
                                >
                                    <Icon name="search" />
                                    {cleanupBusy === 'scan' ? '掃描中…' : '掃描雲端殘留'}
                                </button>
                            )}

                            {cleanupError && (
                                <div style={{ marginTop: 10, fontSize: 12, color: T.danger, lineHeight: 1.6 }}>{cleanupError}</div>
                            )}
                        </div>
                    </Section>
                )}

                {/* 本機孤兒實體檔清理（N10） */}
                {canCleanFiles && (
                    <Section title="孤兒實體檔">
                        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 18px' }}>
                            <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.7, marginBottom: 12 }}>
                                圖片卡與檔案卡的內容存在磁碟上（<code>userData/files/</code>），snapshot 只留檔名。
                                有些刪除路徑不會連帶刪檔——最典型的是<strong>整塊白板被永久刪除</strong>，
                                板裡那些圖就再也沒有人提起它。這些檔不佔 IndexedDB，統計也看不到。
                                <br />
                                掃描會比對<strong>所有</strong>可能引用它的地方：現存白板（含垃圾桶裡還能還原的）、
                                垃圾桶單卡、白板模板，以及<strong>自動備份</strong>。
                                另外<strong>24 小時內修改過的檔一律跳過</strong>，避免誤刪剛貼上、參照還沒寫回資料庫的圖。
                            </div>

                            {filePlan ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                                        <Stat label="可清孤兒檔" value={filePlan.orphans.length} hint={`約 ${formatBytes(filePlan.bytes)}`} />
                                        <Stat label="掃描檔案" value={filePlan.scanned} hint="磁碟上的總數" />
                                        <Stat label="太新暫不動" value={filePlan.skippedTooNew} hint="24 小時內修改過" />
                                    </div>
                                    {filePlan.orphans.length === 0 ? (
                                        <div style={{ fontSize: 13, color: textMuted }}>沒有孤兒檔，磁碟是乾淨的。</div>
                                    ) : (
                                        <button
                                            onClick={() => { void handleCleanupFiles() }}
                                            disabled={fileBusy !== null}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '7px 14px', borderRadius: 8, border: 'none',
                                                background: T.danger, color: 'white', fontSize: 13, fontWeight: 600,
                                                cursor: fileBusy ? 'default' : 'pointer',
                                            }}
                                        >
                                            <Icon name="trash" />
                                            {fileBusy === 'delete' ? '清理中…' : `刪除 ${filePlan.orphans.length} 個檔案（無法復原）`}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => { void handleScanFiles() }}
                                    disabled={fileBusy !== null}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '7px 14px', borderRadius: 8,
                                        border: `1px solid ${border}`, background: 'transparent',
                                        color: textPrimary, fontSize: 13, fontWeight: 500,
                                        cursor: fileBusy ? 'default' : 'pointer',
                                    }}
                                >
                                    <Icon name="search" />
                                    {fileBusy === 'scan' ? '掃描中…' : '掃描孤兒實體檔'}
                                </button>
                            )}

                            {fileError && (
                                <div style={{ marginTop: 10, fontSize: 12, color: T.danger, lineHeight: 1.6 }}>{fileError}</div>
                            )}
                        </div>
                    </Section>
                )}

                {/* 說明 + 入口 */}
                <div style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 12, padding: '14px 16px', fontSize: 13, color: T.accent, lineHeight: 1.7 }}>
                    白板／卡片數量與體積為<strong>唯讀統計</strong>；可以動的是備份保留份數、硬碟備份、雲端殘留與孤兒實體檔。清理個別備份請到自動備份面板。
                    <button
                        onClick={onOpenBackup}
                        style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 7, border: 'none', background: '#2563eb', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                    >前往自動備份 →</button>
                </div>
            </div>

            {/* 從硬碟備份還原：確認對話框（文字與 App 內備份的還原確認一致） */}
            {pendingRestore && (
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: Z_MODAL_BACKDROP }} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        background: cardBg, borderRadius: 14, padding: 24, width: 360,
                        boxShadow: '0 8px 40px rgba(0,0,0,0.2)', border: `1px solid ${border}`, zIndex: Z_MODAL,
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: textPrimary, display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Icon name="toastError" size="md" />確認從備份檔還原
                        </div>
                        <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.7, marginBottom: 16 }}>
                            <strong style={{ color: textPrimary }}>{pendingRestore.fileName}</strong>
                            {pendingRestore.timestamp && <>（{formatClock(pendingRestore.timestamp)}）</>}
                            <br />
                            {pendingRestore.boards.length} 塊白板、{pendingRestore.cardCount} 張卡
                            {pendingRestore.imagesRestored > 0 && <>，已補回 {pendingRestore.imagesRestored} 張缺少的圖片</>}
                            <br /><br />
                            <span style={{ color: T.danger, fontWeight: 500 }}>還原後目前所有白板資料會被覆蓋。</span>
                            {syncOn && (
                                <>
                                    <br /><br />
                                    你開了雲端同步：還原的內容會推上雲端；<strong>備份裡沒有、但雲端有的白板會被拉回來</strong>，不會被刪掉。
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => setPendingRestore(null)}
                                disabled={diskBusy === 'restore'}
                                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: textPrimary }}
                            >取消</button>
                            <button
                                onClick={() => { void handleConfirmRestore() }}
                                disabled={diskBusy === 'restore'}
                                style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#e03131', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                            >{diskBusy === 'restore' ? '還原中…' : '確認還原'}</button>
                        </div>
                    </div>
                </>
            )}
        </FullscreenPanel>
    )
}
