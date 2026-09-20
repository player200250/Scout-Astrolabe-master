// src/components/calendar/YearGrid.tsx — 年檢視（12 個月的密度圖）
//
// 一年 365 格塞不下文字，所以這裡只給濃淡：密度 ＝ 日記 ＋ 到期待辦 ＋ 白板活動。
// 點某一天＝選起來（右側 agenda 會跟著換），點月份標題＝跳去那個月的月檢視。
import { densityLevel } from '../../utils/calendarViews'
import { WEEKDAYS } from '../../utils/calendarViews'
import { T } from '../../theme/tokens'

/** 0 級用底色，其餘四級由淺到深 */
const LEVEL_BG = ['transparent', '#dbeafe', '#93c5fd', '#60a5fa', '#2563eb']

interface YearGridProps {
    year: number
    density: Map<string, number>
    todayDs: string
    selectedDs: string
    onPickDay: (date: Date) => void
    onOpenMonth: (month: number) => void
}

export function YearGrid({ year, density, todayDs, selectedDs, onPickDay, onOpenMonth }: YearGridProps) {
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18 }}>
                {Array.from({ length: 12 }, (_, m) => {
                    const first = new Date(year, m, 1).getDay()
                    const total = new Date(year, m + 1, 0).getDate()
                    const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
                    return (
                        <div key={m} style={{ border: `1px solid ${T.borderLight}`, borderRadius: 10, padding: 10 }}>
                            <div
                                onClick={() => onOpenMonth(m)}
                                style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 6, cursor: 'pointer' }}
                                title="開啟這個月"
                            >{m + 1} 月</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                                {WEEKDAYS.map(d => (
                                    <div key={d} style={{ fontSize: 9, color: '#bbb', textAlign: 'center' }}>{d}</div>
                                ))}
                                {cells.map((day, i) => {
                                    if (!day) return <div key={`e${i}`} />
                                    const ds = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                                    const count = density.get(ds) ?? 0
                                    const lv = densityLevel(count)
                                    const isToday = ds === todayDs
                                    const isSel = ds === selectedDs
                                    return (
                                        <div
                                            key={ds}
                                            onClick={() => onPickDay(new Date(year, m, day))}
                                            title={`${ds} — ${count} 件`}
                                            style={{
                                                aspectRatio: '1 / 1', borderRadius: 3, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
                                                background: LEVEL_BG[lv],
                                                color: lv >= 3 ? 'white' : T.textSecondary,
                                                outline: isSel ? `2px solid ${T.accent}` : isToday ? `1px solid ${T.bgActive}` : 'none',
                                            }}
                                        >{day}</div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 11, color: '#bbb' }}>
                <span>少</span>
                {LEVEL_BG.map((bg, i) => (
                    <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: i === 0 ? `1px solid ${T.borderLight}` : 'none' }} />
                ))}
                <span>多</span>
                <span style={{ marginLeft: 8 }}>密度 ＝ 日記 ＋ 到期待辦 ＋ 白板活動</span>
            </div>
        </div>
    )
}
