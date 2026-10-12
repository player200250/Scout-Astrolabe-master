// src/desktop/UpcomingCard.tsx — 本週到期：明天到 7 天後的待辦（唯讀）
// 跟 TasksCard 互補：那張看今天與逾期，這張看接下來幾天。點任何一筆都開任務中心（ADR 0009）。

import type { DesktopSummary } from '../utils/desktopSummary'
import { sendDesktopCommand } from './useDesktopSummary'

const VISIBLE = 5
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 明天 →「明天」，其他 →「週三」。範圍只有 7 天，週幾不會重複 */
function dueLabel(dueDate: string, today: string): string {
    const [y, m, d] = dueDate.split('-').map(Number)
    const [ty, tm, td] = today.split('-').map(Number)
    const due = new Date(y, m - 1, d)
    const days = Math.round((due.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000)
    return days === 1 ? '明天' : `週${WEEKDAYS[due.getDay()]}`
}

export function UpcomingCard({ summary }: { summary: DesktopSummary | null }) {
    const openTaskCenter = () => sendDesktopCommand({ type: 'open-task-center' })

    if (summary === null) {
        return (
            <section className="dt-card">
                <div className="dt-card-title">本週到期</div>
                <div className="dt-waiting">等待 Scout…</div>
            </section>
        )
    }

    const { count, items } = summary.upcoming
    const rest = count - Math.min(VISIBLE, items.length)

    return (
        <section className="dt-card">
            <div className="dt-card-title">本週到期 <span className="dt-count">{count}</span></div>
            {count === 0 ? (
                <div className="dt-hint">接下來 7 天沒有到期的待辦</div>
            ) : (
                <ul className="dt-list">
                    {items.slice(0, VISIBLE).map((t, i) => (
                        <li key={i}>
                            <button className="dt-row" onClick={openTaskCenter} title={`${t.boardName}：${t.text}（${t.dueDate}）`}>
                                <span className="dt-mark">·</span>
                                <span className="dt-row-text">{t.text || '（未命名待辦）'}</span>
                                <span className="dt-due">{dueLabel(t.dueDate, summary.today)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {rest > 0 && <button className="dt-more" onClick={openTaskCenter}>還有 {rest} 項 →</button>}
        </section>
    )
}
