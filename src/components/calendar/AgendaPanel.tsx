// src/components/calendar/AgendaPanel.tsx — 右側固定 380px 的當日議程
//
// 只在月／年／週檢視出現：日與小時檢視整頁就是那一天，再擺一份只是重複（RC3 版面調整，2026-09-20）。
import type { AgendaData } from '../../utils/calendarEvents'
import { Icon } from '../ui/icons'
import { Section, AgendaRow, Tag, EmptyNote } from './primitives'
import { WEEKDAY_FULL_LABEL as WEEKDAY_FULL } from '../../utils/calendarViews'
import { T } from '../../theme/tokens'

/** 右側 agenda 的固定寬度。月曆才是密的那一半，寬度要留給它。 */
const AGENDA_WIDTH = 380

interface AgendaPanelProps {
    date: Date
    agenda: AgendaData
    hasJournalBoard: boolean
    onJumpToBoard: (boardId: string) => void
    onOpenJournalDay: (date: Date) => void
}

export function AgendaPanel({ date, agenda, hasJournalBoard, onJumpToBoard, onOpenJournalDay }: AgendaPanelProps) {
    const label = `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${WEEKDAY_FULL[date.getDay()]}`

    return (
        <div style={{ width: AGENDA_WIDTH, flexShrink: 0, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, marginBottom: 20 }}>{label}</div>

            <Section icon="cardJournal" label="Journal">
                {agenda.journalCard ? (
                    <AgendaRow onClick={() => onOpenJournalDay(date)}>
                        <span style={{ flex: 1, fontSize: 13, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {agenda.journalCard.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '（空白）'}
                        </span>
                        <Tag>開啟 →</Tag>
                    </AgendaRow>
                ) : hasJournalBoard ? (
                    <AgendaRow onClick={() => onOpenJournalDay(date)} muted>
                        <span style={{ fontSize: 13, color: '#aaa' }}>尚無日記，點擊建立</span>
                        <Tag>建立 →</Tag>
                    </AgendaRow>
                ) : (
                    <EmptyNote>尚未設定 Journal 白板 — 在側邊欄的白板上按右鍵，選「設為 Journal 白板」。</EmptyNote>
                )}
            </Section>

            <Section icon="cardTodo" label="待辦到期">
                {agenda.todos.length === 0 ? <EmptyNote>這天沒有到期待辦 — 待辦卡片設了到期日就會排到這裡。</EmptyNote> : agenda.todos.map((t, i) => (
                    <AgendaRow key={i} onClick={() => onJumpToBoard(t.boardId)}>
                        <span style={{ marginTop: 1, color: t.checked ? '#bbb' : '#d0d0d0', flexShrink: 0, display: 'flex' }}>
                            <Icon name={t.checked ? 'checkboxOn' : 'checkboxOff'} />
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: t.checked ? '#aaa' : T.textPrimary, textDecoration: t.checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.todoText}</span>
                        <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>{t.boardName}</span>
                    </AgendaRow>
                ))}
            </Section>

            <Section icon="overview" label="白板活動">
                {agenda.activeBoards.length === 0 ? <EmptyNote>這天沒有編輯過任何白板。</EmptyNote> : agenda.activeBoards.map(b => (
                    <AgendaRow key={b.boardId} onClick={() => onJumpToBoard(b.boardId)}>
                        <span style={{ flex: 1, fontSize: 13, color: T.textPrimary }}>{b.boardName}</span>
                        <Tag>前往 →</Tag>
                    </AgendaRow>
                ))}
            </Section>
        </div>
    )
}
