// src/components/review/MonthDigest.tsx
//
// 月回顧＝**自動整理，不是另一張要你寫的卡**。
// 使用者 2026-09-29 選這個方向的理由很直接：「說不定又沒有時間寫」——
// 週回顧 10 篇裡只有 4 篇真的寫了，再加一層要手寫的東西只會多一個空位。
// 所以這裡唯讀：把那個月每一週的回顧卡排出來一次讀完，沒寫的就誠實標「未寫」。
import { useMemo } from 'react'
import type { BoardRecord } from '../../db'
import { getWeekRange, getISOWeekKey, weeksOfMonth } from '../../utils/weeklyReviewUtils'
import { findJournalCard } from '../../utils/journalCards'
import { T } from '../../theme/tokens'

interface MonthDigestProps {
    boards: BoardRecord[]
    year: number
    /** 0–11 */
    month: number
    /** 點某一週 → 跳去那一週的可寫檢視 */
    onOpenWeek: (weekStart: Date) => void
}

export function MonthDigest({ boards, year, month, onOpenWeek }: MonthDigestProps) {
    const weeks = useMemo(() => weeksOfMonth(year, month).map(ws => {
        const { start, end, weekNum } = getWeekRange(ws)
        const card = findJournalCard(boards, getISOWeekKey(ws))
        return { ws, start, end, weekNum, html: card?.text ?? null }
    }), [boards, year, month])

    const written = weeks.filter(w => w.html).length

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>
                    共 {weeks.length} 週，其中 {written} 週有回顧紀錄
                    {written < weeks.length && `，${weeks.length - written} 週未寫`}
                </div>

                {weeks.map(w => (
                    <div key={w.weekNum} style={{ marginBottom: 22 }}>
                        <div
                            onClick={() => onOpenWeek(w.ws)}
                            title="開啟這一週的回顧（可編輯）"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                paddingBottom: 6, borderBottom: `1px solid ${T.borderLight}`, marginBottom: 8,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '0.72')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >
                            <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>第 {w.weekNum} 週</span>
                            <span style={{ fontSize: 11, color: T.textMuted }}>
                                {w.start.getMonth() + 1}/{w.start.getDate()} – {w.end.getMonth() + 1}/{w.end.getDate()}
                            </span>
                            <span style={{
                                marginLeft: 'auto', fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '2px 7px',
                                color: w.html ? '#2563eb' : T.textMuted,
                                background: w.html ? T.accentBg : T.bgMuted,
                            }}>{w.html ? '有紀錄' : '未寫'}</span>
                        </div>

                        {w.html ? (
                            <div className="tiptap-readonly md-week" dangerouslySetInnerHTML={{ __html: w.html }} />
                        ) : (
                            <div style={{ fontSize: 12, color: T.textMuted, padding: '4px 0' }}>
                                這一週沒有回顧卡。點上方標題可以現在補寫。
                            </div>
                        )}
                    </div>
                ))}

                <style>{`
                    .md-week { color: ${T.textSecondary}; font-size: 13px; line-height: 1.75; }
                    .md-week h2 { font-size: 14px; font-weight: 700; margin: 0 0 6px; color: ${T.textPrimary}; }
                    .md-week p { margin: 3px 0; }
                    .md-week strong { color: ${T.textPrimary}; }
                    .md-week ul { padding-left: 20px; margin: 3px 0; }
                `}</style>
            </div>
        </div>
    )
}
