// src/desktop/TasksCard.tsx — 右上：逾期＋今天到期的待辦（唯讀）
// 點任何一筆都開任務中心：在 Desktop 勾待辦會變成第二個寫入者，刻意不做（ADR 0009）。

import type { DesktopSummary } from '../utils/desktopSummary'
import { sendDesktopCommand } from './useDesktopSummary'

const VISIBLE = 5

function dueLabel(dueDate: string, isOverdue: boolean): string {
    if (!isOverdue) return '今天'
    const [, m, d] = dueDate.split('-').map(Number)
    return `${m}/${d}`
}

export function TasksCard({ summary }: { summary: DesktopSummary | null }) {
    const openTaskCenter = () => sendDesktopCommand({ type: 'open-task-center' })

    if (summary === null) {
        return (
            <section className="dt-card">
                <div className="dt-card-title">今日任務</div>
                <div className="dt-waiting">等待 Scout…</div>
            </section>
        )
    }

    const { overdueCount, todayCount, items } = summary.tasks
    const total = overdueCount + todayCount
    const rest = total - Math.min(VISIBLE, items.length)

    return (
        <section className="dt-card">
            <div className="dt-card-title">今日任務 <span className="dt-count">{total}</span></div>
            {total === 0 ? (
                <div className="dt-hint">今天沒有到期的待辦</div>
            ) : (
                <ul className="dt-list">
                    {items.slice(0, VISIBLE).map((t, i) => (
                        <li key={i}>
                            <button className="dt-row" onClick={openTaskCenter} title={`${t.boardName}：${t.text}`}>
                                <span className={t.isOverdue ? 'dt-mark dt-mark-overdue' : 'dt-mark'}>{t.isOverdue ? '!' : '·'}</span>
                                <span className="dt-row-text">{t.text || '（未命名待辦）'}</span>
                                <span className={t.isOverdue ? 'dt-due dt-due-overdue' : 'dt-due'}>{dueLabel(t.dueDate, t.isOverdue)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {rest > 0 && <button className="dt-more" onClick={openTaskCenter}>還有 {rest} 項 →</button>}
        </section>
    )
}
