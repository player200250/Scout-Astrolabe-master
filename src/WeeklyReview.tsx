// src/WeeklyReview.tsx
//
// 週回顧分頁。RC2（2026-09-20）之前這裡是一條 440px 的窄欄居中，兩側大片空白，
// 而且**看不到週回顧卡的內容**——只有「本週統計」加一顆跳去白板的按鈕，
// 寫好的週回顧要自己去畫布上找。現在改成左統計、右內文兩欄，並且可以翻週。
//
// 註：原本檔尾還有一個 320px 的 standalone 側邊面板 `WeeklyReview`，
// 全專案沒有任何人 import（孤兒，同 WO2 的情況），本次一併移除，只留 Content 版。
import { useMemo, useState } from 'react'
import type { BoardRecord } from './db'
import { getCardShapes } from './utils/snapshot'
import { getWeekRange, getISOWeekKey } from './utils/weeklyReviewUtils'
import { JournalCardEditor } from './components/review/JournalCardEditor'
import { EmptyState } from './components/ui/EmptyState'
import { Icon } from './components/ui/icons'
import type { IconName } from './components/ui/icons'
import { T } from './theme/tokens'
import { useIsDark } from './theme/ThemeContext'

/* ------------------------------------------------------------------ Stats */
interface WeekStats {
    cardsByBoard: { boardName: string; count: number }[]
    totalCards: number
    completedTodos: number
    wikiLinks: number
}

function computeWeekStats(boards: BoardRecord[], weekStart: Date, weekEnd: Date): WeekStats {
    const cardsByBoard: { boardName: string; count: number }[] = []
    let completedTodos = 0
    let wikiLinks = 0
    for (const board of boards) {
        if (board.updatedAt < weekStart.getTime() || board.updatedAt > weekEnd.getTime()) continue
        const shapes = getCardShapes(board.snapshot)
        if (shapes.length === 0) continue
        for (const shape of shapes) {
            if (shape.props.type === 'todo') {
                completedTodos += (shape.props.todos ?? []).filter(t => t.checked).length
            }
            if (shape.props.text) {
                const matches = shape.props.text.match(/\[\[[^\]]+\]\]/g)
                if (matches) wikiLinks += matches.length
            }
        }
        cardsByBoard.push({ boardName: board.name, count: shapes.length })
    }
    cardsByBoard.sort((a, b) => b.count - a.count)
    return { cardsByBoard, totalCards: cardsByBoard.reduce((s, b) => s + b.count, 0), completedTodos, wikiLinks }
}

/** 該週還沒有回顧卡時，編輯器帶入的空模板（與既有卡片的結構一致） */
function weeklyTemplate(weekNum: number, startLabel: string, endLabel: string): string {
    return `<h2>第 ${weekNum} 週回顧（${startLabel} - ${endLabel}）</h2>`
        + '<p><strong>這週完成了什麼</strong></p><p></p>'
        + '<p><strong>這週學到什麼</strong></p><p></p>'
        + '<p><strong>卡住的地方 &amp; 解法</strong></p><p></p>'
        + '<p><strong>下週目標（3 件事）</strong></p><p></p>'
        + '<p><strong>需要跟進的白板</strong></p><p></p>'
}

function addWeeks(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(d.getDate() + n * 7); return r
}

/* ------------------------------------------------------------------ WeeklyReviewContent (embeddable) */
interface WeeklyReviewContentProps {
    boards: BoardRecord[]
    onGoToWeeklyCard: () => void
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
}

export function WeeklyReviewContent({ boards, onGoToWeeklyCard, onSaveJournal }: WeeklyReviewContentProps) {
    const isDark = useIsDark()
    // 看哪一週：預設本週，← → 可以翻到過去／未來的任何一週
    const [anchor, setAnchor] = useState<Date>(() => new Date())

    const { start: weekStart, end: weekEnd, weekNum } = useMemo(() => getWeekRange(anchor), [anchor])
    const weekKey = useMemo(() => getISOWeekKey(anchor), [anchor])
    const stats = useMemo(() => computeWeekStats(boards, weekStart, weekEnd), [boards, weekStart, weekEnd])

    const startLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
    const endLabel   = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`
    const hasJournalBoard = boards.some(b => b.isJournal)
    const isCurrentWeek = weekKey === getISOWeekKey(new Date())

    const textPrimary   = T.textPrimary
    const textSecondary = T.textSecondary
    const cardsBg       = T.accentBg
    const noteBg        = T.bgApp
    const noteBorder    = T.borderLight

    const navBtnStyle: React.CSSProperties = {
        padding: '3px 10px', borderRadius: 8, border: `1px solid ${T.borderLight}`,
        background: 'transparent', cursor: 'pointer', fontSize: 13, color: T.textSecondary, fontWeight: 500,
    }

    const statCard = (bg: string, darkBg: string, icon: IconName, label: string, value: string | number, valueColor: string) => (
        <div style={{ background: isDark ? darkBg : bg, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ display: 'flex', color: valueColor }}><Icon name={icon} size="md" /></span>
            <span style={{ fontSize: 13, color: textPrimary, fontWeight: 500 }}>{label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: valueColor }}>{value}</span>
        </div>
    )

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {/* 左欄：週導覽 ＋ 本週統計。固定 420，不隨視窗寬度變形 */}
            <div style={{
                width: 420, flexShrink: 0, borderRight: `1px solid ${T.borderLight}`,
                overflowY: 'auto', padding: '14px 16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <button onClick={() => setAnchor(a => addWeeks(a, -1))} title="上一週" style={navBtnStyle}>←</button>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>第 {weekNum} 週</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{startLabel} – {endLabel}</div>
                    </div>
                    <button onClick={() => setAnchor(a => addWeeks(a, 1))} title="下一週" style={navBtnStyle}>→</button>
                    {!isCurrentWeek && (
                        <button onClick={() => setAnchor(new Date())} title="回到本週" style={{ ...navBtnStyle, color: T.accent }}>本週</button>
                    )}
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                    {isCurrentWeek ? '本週統計' : '該週統計'}
                </div>

                <div style={{ background: cardsBg, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats.cardsByBoard.length > 0 ? 8 : 0 }}>
                        <span style={{ display: 'flex', color: '#2563eb' }}><Icon name="overview" size="md" /></span>
                        <span style={{ fontSize: 13, color: textPrimary, fontWeight: 500 }}>有活動的卡片</span>
                        <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: '#2563eb' }}>{stats.totalCards}</span>
                    </div>
                    {stats.cardsByBoard.length > 0 ? (
                        <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {stats.cardsByBoard.map(({ boardName, count }) => (
                                <div key={boardName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textSecondary }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{boardName}</span>
                                    <span style={{ color: '#2563eb', fontWeight: 600, flexShrink: 0 }}>{count} 張</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ fontSize: 11, color: '#bbb', paddingLeft: 24 }}>這週尚無活動</div>
                    )}
                </div>

                {statCard('#f0fdf4', '#0d2818', 'done', '完成待辦', `${stats.completedTodos} 項`, '#16a34a')}
                {statCard('#faf5ff', '#1d1133', 'knowledgeGraph', '[[]] 知識連結', `${stats.wikiLinks} 個`, '#7c3aed')}

                <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.6, padding: '8px 10px', background: noteBg, borderRadius: 8, border: `1px solid ${noteBorder}`, marginTop: 4 }}>
                    統計範圍：{startLabel} – {endLabel}（週一至週日）有更新記錄的白板
                </div>

                {!hasJournalBoard && (
                    <div style={{ marginTop: 12, padding: '10px 12px', background: '#fffbe6', borderRadius: 8, border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
                        尚未設定 Journal 白板。在白板右鍵選單中選「設為 Journal 白板」即可啟用週回顧卡片。
                    </div>
                )}

                <div style={{ padding: '12px 0 4px' }}>
                    <button
                        onClick={onGoToWeeklyCard}
                        disabled={!hasJournalBoard}
                        style={{
                            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                            background: hasJournalBoard ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : (T.bgMuted),
                            color: hasJournalBoard ? 'white' : (T.textMuted),
                            fontSize: 13, fontWeight: 600,
                            cursor: hasJournalBoard ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => { if (hasJournalBoard) e.currentTarget.style.opacity = '0.88' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                    >
                        在白板上開啟本週卡片 →
                    </button>
                </div>
            </div>

            {/* 右欄：這一週的回顧卡內文，直接在這裡讀與寫 */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    padding: '12px 16px', borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>第 {weekNum} 週回顧</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{weekKey}</span>
                </div>

                {hasJournalBoard ? (
                    <JournalCardEditor
                        boards={boards}
                        dateKey={weekKey}
                        template={weeklyTemplate(weekNum, startLabel, endLabel)}
                        onSaveJournal={onSaveJournal}
                        maxWidth={760}
                    />
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <EmptyState
                            icon="cardJournal"
                            title="尚未設定 Journal 白板"
                            hint="在側邊欄的白板上按右鍵，選「設為 Journal 白板」，週回顧就會寫進那塊板。"
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
