import { useState, useEffect, useMemo } from 'react'
import type { BoardRecord, BackupRecord } from '../db'
import { loadBackups, MAX_BACKUPS } from '../db'
import { computeVaultStats, formatBytes } from '../utils/dataSafetyStats'

interface DataSafetyPanelProps {
    boards: BoardRecord[]
    onClose: () => void
    onOpenBackup: () => void
    isDark: boolean
}

const TYPE_LABEL: Record<string, string> = {
    text: '文字', image: '圖片', todo: '待辦', link: '連結', board: '子板',
    journal: '日誌', heading: '標題', sticky: '便利貼', table: '表格',
    color: '顏色', file: '檔案',
}

export function DataSafetyPanel({ boards, onClose, onOpenBackup, isDark }: DataSafetyPanelProps) {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)

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

    const overlayBg = isDark ? 'rgba(15,23,42,0.97)' : 'rgba(245,245,243,0.97)'
    const cardBg = isDark ? '#1e293b' : 'white'
    const border = isDark ? '#334155' : '#e8e8e6'
    const textPrimary = isDark ? '#e2e8f0' : '#1a1a1a'
    const textMuted = isDark ? '#94a3b8' : '#888'
    const trackBg = isDark ? '#0f172a' : '#f0f0ee'

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
                <span style={{ fontSize: 12, color: textMuted, background: trackBg, borderRadius: 6, padding: '2px 8px' }}>唯讀統計</span>
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
                        <Stat label="自動備份" value={`${stats.backups.count} / ${MAX_BACKUPS}`} hint={`約 ${formatBytes(stats.backups.bytes)}`} />
                    </div>
                </Section>

                {/* 說明 + 入口 */}
                <div style={{ background: isDark ? 'rgba(37,99,235,0.12)' : '#eff6ff', border: `1px solid ${isDark ? '#1e40af' : '#bfdbfe'}`, borderRadius: 12, padding: '14px 16px', fontSize: 13, color: isDark ? '#bfdbfe' : '#1e40af', lineHeight: 1.7 }}>
                    目前為<strong>唯讀統計</strong>——清理舊備份、移除無用縮圖等操作尚未開放。備份保留上限為 {MAX_BACKUPS} 份（見 OOM 治理）。
                    <button
                        onClick={onOpenBackup}
                        style={{ marginLeft: 8, padding: '4px 12px', borderRadius: 7, border: 'none', background: '#2563eb', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                    >前往自動備份 →</button>
                </div>
            </div>
        </div>
    )
}
