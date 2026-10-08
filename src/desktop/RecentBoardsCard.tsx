// src/desktop/RecentBoardsCard.tsx — 左下：最近造訪的白板（最多 5 個），點了在主視窗打開

import type { DesktopSummary } from '../utils/desktopSummary'
import { sendDesktopCommand } from './useDesktopSummary'

export function RecentBoardsCard({ summary }: { summary: DesktopSummary | null }) {
    return (
        <section className="dt-card">
            <div className="dt-card-title">最近白板</div>
            {summary === null ? (
                <div className="dt-waiting">等待 Scout…</div>
            ) : summary.recentBoards.length === 0 ? (
                <div className="dt-hint">還沒有打開過的白板</div>
            ) : (
                <ul className="dt-list">
                    {summary.recentBoards.map(b => (
                        <li key={b.id}>
                            <button className="dt-row" onClick={() => sendDesktopCommand({ type: 'open-board', boardId: b.id })} title={b.name}>
                                <span className="dt-mark">·</span>
                                <span className="dt-row-text">{b.name || '（未命名白板）'}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
