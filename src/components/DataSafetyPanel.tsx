import { useState, useEffect, useMemo } from 'react'
import type { BoardRecord, BackupRecord } from '../db'
import { loadBackups, trimBackups } from '../db'
import { computeVaultStats, formatBytes } from '../utils/dataSafetyStats'
import { BACKUP_LIMIT_OPTIONS, getBackupLimit, setBackupLimit } from '../utils/backupSettings'
import { showToast } from '../utils/toast'
import { T } from '../theme/tokens'

interface DataSafetyPanelProps {
    boards: BoardRecord[]
    onClose: () => void
    onOpenBackup: () => void
}

const TYPE_LABEL: Record<string, string> = {
    text: '文字', image: '圖片', todo: '待辦', link: '連結', board: '子板',
    journal: '日誌', heading: '標題', sticky: '便利貼', table: '表格',
    color: '顏色', file: '檔案',
}

export function DataSafetyPanel({ boards, onClose, onOpenBackup }: DataSafetyPanelProps) {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
    const [backupLimit, setBackupLimitState] = useState(() => getBackupLimit())

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

    const overlayBg = T.bgOverlay
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: overlayBg, backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 24px', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🛡️</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>資料安全中心</span>
                <span style={{ fontSize: 12, color: textMuted, background: trackBg, borderRadius: 6, padding: '2px 8px' }}>統計與備份設定</span>
                <div style={{ flex: 1 }} />
                <button onClick={onClose} title="關閉 (Esc)" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', fontSize: 15, color: textMuted }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', maxWidth: 780, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
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
                        <Stat label="子板" value={stats.boards.sub} />
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

                {/* 說明 + 入口 */}
                <div style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: 12, padding: '14px 16px', fontSize: 13, color: T.accent, lineHeight: 1.7 }}>
                    除了保留份數之外，其餘為<strong>唯讀統計</strong>——清理個別備份請到自動備份面板，移除無用縮圖尚未開放。
                    <button
                        onClick={onOpenBackup}
                        style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 7, border: 'none', background: '#2563eb', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                    >前往自動備份 →</button>
                </div>
            </div>
        </div>
    )
}
