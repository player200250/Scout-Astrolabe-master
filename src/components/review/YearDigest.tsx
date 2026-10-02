// src/components/review/YearDigest.tsx
//
// 年回顧＝12 個月的自動整理，同樣唯讀（理由見 MonthDigest 的檔頭）。
// 這一層刻意**不**把每週內文攤開——12 個月 × 4～5 週的全文沒有人會讀完。
// 它只回答「哪幾個月有在寫、那幾個月做了多少事」，點下去才進月，再點才進週。
import { useMemo } from 'react'
import type { BoardRecord } from '../../db'
import {
    getWeekRange, getISOWeekKey, weeksOfMonth, computeRangeStats,
} from '../../utils/weeklyReviewUtils'
import { findJournalCard } from '../../utils/journalCards'
import { T } from '../../theme/tokens'

interface YearDigestProps {
    boards: BoardRecord[]
    year: number
    /** 點某個月 → 跳去那個月的整理 */
    onOpenMonth: (month: number) => void
}

export function YearDigest({ boards, year, onOpenMonth }: YearDigestProps) {
    const months = useMemo(() => Array.from({ length: 12 }, (_, m) => {
        const weeks = weeksOfMonth(year, m)
        const written = weeks.filter(ws => !!findJournalCard(boards, getISOWeekKey(ws))).length
        const first = weeks[0], last = weeks[weeks.length - 1]
        const stats = first && last
            ? computeRangeStats(boards, getWeekRange(first).start, getWeekRange(last).end)
            : { totalCards: 0, completedTodos: 0, wikiLinks: 0, journalDays: 0, cardsByBoard: [], coverage: 'none' as const }
        return {
            m, weeks: weeks.length, written, stats,
            firstWeek: first ? getWeekRange(first).weekNum : null,
            lastWeek: last ? getWeekRange(last).weekNum : null,
        }
    }), [boards, year])

    // 長條＝卡片＋完成待辦＋日記天數（同週回顧的走勢圖）：10/02 之前沒有卡片紀錄，只看卡片會整排貼底（RC16）
    const scoreOf = (st: { totalCards: number; completedTodos: number; journalDays: number }) => st.totalCards + st.completedTodos + st.journalDays
    const maxScore = Math.max(1, ...months.map(x => scoreOf(x.stats)))
    const totalWritten = months.reduce((s, x) => s + x.written, 0)
    const totalWeeks = months.reduce((s, x) => s + x.weeks, 0)

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>
                    全年 {totalWeeks} 週，其中 {totalWritten} 週有回顧紀錄
                </div>

                {months.map(x => (
                    <div
                        key={x.m}
                        onClick={() => onOpenMonth(x.m)}
                        title={`開啟 ${x.m + 1} 月的整理`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            padding: '10px 4px', borderBottom: `1px solid ${T.borderLight}`,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        <span style={{ width: 46, flexShrink: 0, fontSize: 14, fontWeight: 600, color: T.textPrimary }}>
                            {x.m + 1} 月
                        </span>

                        <span style={{ width: 88, flexShrink: 0, fontSize: 11, color: T.textMuted }}>
                            {x.firstWeek ? `第 ${x.firstWeek}–${x.lastWeek} 週` : '—'}
                        </span>

                        {/* 活動量條：跟 RC8 走勢圖同一種語彙，0 的月份留基線仍可點 */}
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ flex: 1, minWidth: 0, height: 6, borderRadius: 3, background: T.bgMuted, overflow: 'hidden' }}>
                                <span style={{
                                    display: 'block', height: '100%', borderRadius: 3,
                                    width: `${Math.max(2, Math.round((scoreOf(x.stats) / maxScore) * 100))}%`,
                                    background: scoreOf(x.stats) > 0 ? T.bgActive : T.borderMid,
                                }} />
                            </span>
                            <span style={{ width: 118, flexShrink: 0, fontSize: 11, color: T.textMuted, textAlign: 'right' }}>
                                卡片 {x.stats.coverage === 'none' ? '—' : x.stats.totalCards} · 待辦 {x.stats.completedTodos}
                            </span>
                        </span>

                        <span style={{
                            width: 64, flexShrink: 0, textAlign: 'center',
                            fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '2px 6px',
                            color: x.written ? '#2563eb' : T.textMuted,
                            background: x.written ? T.accentBg : T.bgMuted,
                        }}>{x.written}/{x.weeks} 週</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
