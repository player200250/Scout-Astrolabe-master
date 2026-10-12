// src/desktop/BackupCard.tsx — 資料安全：上次硬碟備份是多久以前
// 超過 1 天變黃、超過 3 天變紅（describeBackupAge）。按鈕開主視窗的資料安全中心，
// Desktop 自己不做備份：備份要讀全部白板，那是主視窗的事。

import { describeBackupAge } from '../utils/desktopBackup'
import { sendDesktopCommand } from './useDesktopSummary'

const ADVICE = {
    ok: '硬碟備份正常',
    warn: '超過 1 天沒有新的硬碟備份',
    danger: '很久沒有硬碟備份了，建議打開看看',
}

export function BackupCard({ now, latest, connected }: { now: Date; latest: number | null | undefined; connected: boolean }) {
    const age = latest === undefined ? null : describeBackupAge(latest, now.getTime())

    return (
        <section className="dt-card dt-backup">
            <div className="dt-card-title">資料安全</div>
            {age === null ? (
                <div className="dt-waiting">讀取中…</div>
            ) : (
                <>
                    <div className="dt-hint">上次硬碟備份</div>
                    <div className={`dt-backup-age dt-backup-${age.level}`}>{age.text}</div>
                    <div className={age.level === 'ok' ? 'dt-hint' : `dt-backup-advice dt-backup-${age.level}`}>{ADVICE[age.level]}</div>
                </>
            )}
            <div className="dt-backup-footer">
                <button
                    className="dt-button"
                    disabled={!connected}
                    title={connected ? undefined : '等待 Scout…'}
                    onClick={() => sendDesktopCommand({ type: 'open-data-safety' })}
                >資料安全中心</button>
            </div>
        </section>
    )
}
