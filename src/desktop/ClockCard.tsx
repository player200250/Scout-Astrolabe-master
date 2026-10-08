// src/desktop/ClockCard.tsx — 左上：時鐘＋日期＋週次＋今天的日記寫了沒
// 時鐘只靠 renderer，主視窗沒就緒也照走；日記那一行才需要摘要。

import { getISOWeekNumber } from '../utils/date'
import type { DesktopSummary } from '../utils/desktopSummary'
import { sendDesktopCommand } from './useDesktopSummary'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')

export function ClockCard({ now, summary }: { now: Date; summary: DesktopSummary | null }) {
    return (
        <section className="dt-card dt-clock">
            <div className="dt-clock-time">{pad(now.getHours())}:{pad(now.getMinutes())}</div>
            <div className="dt-card-title">{pad(now.getMonth() + 1)}/{pad(now.getDate())}（{WEEKDAYS[now.getDay()]}）</div>
            <div className="dt-hint">第 {getISOWeekNumber(now)} 週</div>
            <div className="dt-journal">
                {summary === null ? (
                    <span className="dt-waiting">等待 Scout…</span>
                ) : (
                    <>
                        <span className={summary.journal.hasEntryToday ? 'dt-journal-done' : 'dt-journal-todo'}>
                            日記 {summary.journal.hasEntryToday ? '✓ 已寫' : '✗ 還沒寫'}
                        </span>
                        <button className="dt-button" onClick={() => sendDesktopCommand({ type: 'open-journal' })}>開啟</button>
                    </>
                )}
            </div>
        </section>
    )
}
