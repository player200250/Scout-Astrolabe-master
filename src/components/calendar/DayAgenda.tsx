// src/components/calendar/DayAgenda.tsx — 日檢視（整天議程，整頁寬）
//
// 與小時檢視的差別：這裡不畫 24 小時的空格，只把「這天真的有的東西」列出來，
// 白板活動帶著更新時刻。小時檢視適合看分布，日檢視適合看內容。
import type { DayTimeline } from '../../utils/calendarViews'
import { Icon } from '../ui/icons'
import { Section, AgendaRow, Tag, EmptyNote } from './primitives'
import { T } from '../../theme/tokens'

interface DayAgendaProps {
    day: DayTimeline
    /** 是否已設定 Journal 白板（沒有的話連「建立日記」都不該給） */
    hasJournalBoard: boolean
    onJumpToBoard: (boardId: string) => void
    onOpenJournalDay: (date: Date) => void
}

export function DayAgenda({ day, hasJournalBoard, onJumpToBoard, onOpenJournalDay }: DayAgendaProps) {
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 32px' }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
                <Section icon="cardJournal" label="Journal">
                    {day.hasJournal ? (
                        <AgendaRow onClick={() => onOpenJournalDay(day.date)}>
                            <span style={{ flex: 1, fontSize: 13, color: T.textPrimary }}>這天有日記</span>
                            <Tag>開啟 →</Tag>
                        </AgendaRow>
                    ) : hasJournalBoard ? (
                        <AgendaRow onClick={() => onOpenJournalDay(day.date)} muted>
                            <span style={{ fontSize: 13, color: '#aaa' }}>尚無日記，點擊建立</span>
                            <Tag>建立 →</Tag>
                        </AgendaRow>
                    ) : (
                        <EmptyNote>尚未設定 Journal 白板 — 在側邊欄的白板上按右鍵，選「設為 Journal 白板」。</EmptyNote>
                    )}
                </Section>

                <Section icon="cardTodo" label="待辦到期">
                    {day.todos.length === 0 ? <EmptyNote>這天沒有到期待辦。</EmptyNote> : day.todos.map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.borderLight}` }}>
                            <span style={{ color: t.checked ? '#bbb' : '#d0d0d0', display: 'flex' }}>
                                <Icon name={t.checked ? 'checkboxOn' : 'checkboxOff'} />
                            </span>
                            <span style={{ flex: 1, fontSize: 13, color: t.checked ? '#aaa' : T.textPrimary, textDecoration: t.checked ? 'line-through' : 'none' }}>{t.text}</span>
                        </div>
                    ))}
                </Section>

                <Section icon="overview" label="白板活動（依更新時刻）">
                    {day.timed.length === 0 ? <EmptyNote>這天沒有編輯過任何白板。</EmptyNote> : day.timed.map(a => (
                        <AgendaRow key={a.boardId} onClick={() => onJumpToBoard(a.boardId)}>
                            <span style={{ fontSize: 12, color: '#888', width: 44, flexShrink: 0 }}>
                                {String(a.hour).padStart(2, '0')}:{String(a.minute).padStart(2, '0')}
                            </span>
                            <span style={{ flex: 1, fontSize: 13, color: T.textPrimary }}>{a.boardName}</span>
                            <Tag>前往 →</Tag>
                        </AgendaRow>
                    ))}
                </Section>
            </div>
        </div>
    )
}
