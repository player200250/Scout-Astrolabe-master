// src/components/calendar/primitives.tsx
//
// 月曆／議程共用的小零件。單獨一檔是為了讓五種檢視（月／週／日／小時／年）長得一樣，
// 而不是每個檢視各自寫一份 chip 樣式——那正是這次拆檔前的狀態。
import React from 'react'
import { Icon } from '../ui/icons'
import { T } from '../../theme/tokens'

// 週名常數在 utils/calendarViews.ts（元件檔匯出非元件會擋住 fast refresh），各檢視自己去那裡 import。

/** 日記標記（黃色 chip）。月格子、週／小時檢視的全天列都用它。 */
export function JournalChip() {
    return (
        <div style={{
            height: 18, borderRadius: 3, padding: '0 4px', background: '#fef3c7', color: '#92400e',
            fontSize: 10, lineHeight: '18px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
        }}>
            <Icon name="cardJournal" />日記
        </div>
    )
}

/**
 * 待辦 chip。
 * ⚠️ 文字不要在這裡截斷——RC3 的成因就是「先 slice(0,12) 再套 CSS 省略號」的雙重截斷，
 * 不管格子多寬都只剩半句。讓 textOverflow 負責到格寬為止。
 *
 * 省略號要生效，**容器那側**必須能縮到比文字窄：放 chip 的格子得有 minWidth: 0，
 * 承載它的 grid 欄得是 minmax(0, 1fr)。少了任一個，長待辦就會把整欄撐開（月檢視踩過）。
 * 截斷後看不到全文，所以這裡掛 title 讓 hover 補回來。
 */
export function TodoChip({ text, checked }: { text: string; checked: boolean }) {
    const label = text || '（無標題）'
    return (
        <div
            title={(checked ? '✔ ' : '• ') + label}
            style={{
                height: 18, borderRadius: 3, padding: '0 4px', fontSize: 10, lineHeight: '18px',
                background: checked ? T.bgHover : '#fee2e2', color: checked ? '#aaa' : '#991b1b',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flexShrink: 0,
                minWidth: 0, textDecoration: checked ? 'line-through' : 'none',
            }}
        >{label}</div>
    )
}

/** 超過顯示上限的待辦改用密度點；hover 看得到完整清單 */
export function MoreDots({ items, maxDots }: { items: { text: string; checked: boolean }[]; maxDots: number }) {
    if (items.length === 0) return null
    return (
        <div
            title={items.map(t => (t.checked ? '✔ ' : '• ') + t.text).join('\n')}
            style={{ display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 4, lineHeight: '14px', flexShrink: 0 }}
        >
            {items.slice(0, maxDots).map((t, i) => (
                <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: t.checked ? '#cbd5e1' : '#ef4444',
                }} />
            ))}
            <span style={{ fontSize: 9, color: '#bbb', marginLeft: 1 }}>還有 {items.length} 項</span>
        </div>
    )
}

export function Section({ icon, label, children }: {
    icon: React.ComponentProps<typeof Icon>['name']
    label: string
    children: React.ReactNode
}) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                color: T.textMuted, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6,
            }}>
                <Icon name={icon} />{label}
            </div>
            <div>{children}</div>
        </div>
    )
}

export function AgendaRow({ onClick, children, muted }: {
    onClick: () => void
    children: React.ReactNode
    muted?: boolean
}) {
    return (
        <div
            onClick={onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer', borderBottom: `1px solid ${T.borderLight}`, opacity: muted ? 0.7 : 1 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = muted ? '0.7' : '1')}
        >{children}</div>
    )
}

export function Tag({ children }: { children: React.ReactNode }) {
    return <span style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', background: '#eff6ff', borderRadius: 5, padding: '2px 6px', flexShrink: 0, whiteSpace: 'nowrap' }}>{children}</span>
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 12, color: T.textMuted, padding: '6px 0', lineHeight: 1.6 }}>{children}</div>
}

