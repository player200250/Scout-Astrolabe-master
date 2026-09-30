// src/JournalDayView.tsx
// 編輯器本體與週回顧共用 JournalCardEditor（2026-09-30 併掉原本這裡的整份複本）。
import { useEffect } from 'react'
import type { BoardRecord } from './db'
import { JournalCardEditor } from './components/review/JournalCardEditor'
import { EmptyState } from './components/ui/EmptyState'
import { T } from './theme/tokens'

function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(d: Date): string {
    const days = ['日', '一', '二', '三', '四', '五', '六']
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${days[d.getDay()]}`
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(d.getDate() + n); return r
}

function defaultTemplate(ds: string): string {
    const [y, m, d] = ds.split('-').map(Number)
    const days = ['日', '一', '二', '三', '四', '五', '六']
    const label = `${m}/${d}（${days[new Date(y, m - 1, d).getDay()]}）`
    return `<h2>${label}</h2><p><strong>今天做了什麼</strong></p><p></p><p><strong>學到什麼</strong></p><p></p><p><strong>卡住的地方</strong></p><p></p><p><strong>明天先做</strong></p><p></p>`
}

/* ------------------------------------------------------------------ JournalDayContent (embeddable) */
interface JournalDayContentProps {
    date: Date
    boards: BoardRecord[]
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    onDateChange: (date: Date) => void
    onClose?: () => void
}

export function JournalDayContent({ date, boards, onSaveJournal, onDateChange, onClose }: JournalDayContentProps) {
    const ds = toDateStr(date)
    const journalBoardId = boards.find(b => b.isJournal)?.id ?? null

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            // defaultPrevented：Esc 已被編輯器的選單用掉（同 ReviewCenter 的說明）
            if (e.key === 'Escape' && onClose && !e.defaultPrevented) { onClose(); return }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') { e.preventDefault(); onDateChange(addDays(date, -1)) }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') { e.preventDefault(); onDateChange(addDays(date, 1)) }
        }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose, onDateChange, date])

    const isToday = ds === toDateStr(new Date())

    const navBorder  = T.borderLight
    const titleColor = T.textPrimary
    const btnBorder  = T.borderLight
    const btnColor   = T.textSecondary
    const separatorColor = T.borderLight

    const navBtnStyle: React.CSSProperties = {
        padding: '4px 10px', borderRadius: 8, border: `1px solid ${btnBorder}`,
        background: 'transparent', cursor: 'pointer', fontSize: 13, color: btnColor, fontWeight: 500,
    }

    return (
        <>
            {/* Date nav header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderBottom: `1px solid ${navBorder}`, flexShrink: 0 }}>
                <button onClick={() => onDateChange(addDays(date, -1))} title="前一天 (Ctrl+←)" style={navBtnStyle}>←</button>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: titleColor }}>{formatDate(date)}</span>
                    {isToday && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: T.bgActive, color: 'white', borderRadius: 4, padding: '1px 5px' }}>今天</span>}
                </div>
                <button onClick={() => onDateChange(addDays(date, 1))} title="後一天 (Ctrl+→)" style={navBtnStyle}>→</button>
                {onClose && (
                    <>
                        <div style={{ width: 1, height: 16, background: separatorColor }} />
                        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${btnBorder}`, background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                    </>
                )}
            </div>

            {/* Editor / empty state */}
            {!journalBoardId ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <EmptyState
                        icon="cardJournal"
                        title="尚未設定 Journal 白板"
                        hint="在側邊欄的白板上按右鍵，選「設為 Journal 白板」，之後每天的日記都會存進那塊板。"
                    />
                </div>
            ) : (
                <JournalCardEditor
                    boards={boards}
                    dateKey={ds}
                    template={defaultTemplate(ds)}
                    onSaveJournal={onSaveJournal}
                    maxWidth={680}
                />
            )}
        </>
    )
}
