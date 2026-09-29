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
import { getWeekRange, getISOWeekKey, recentWeekStarts, computeRangeStats, weeksOfMonth } from './utils/weeklyReviewUtils'
import { MonthDigest } from './components/review/MonthDigest'
import { YearDigest } from './components/review/YearDigest'
import { findJournalCard, isUntouchedTemplate } from './utils/journalCards'
import { JournalCardEditor } from './components/review/JournalCardEditor'
import { EmptyState } from './components/ui/EmptyState'
import { Icon } from './components/ui/icons'
import type { IconName } from './components/ui/icons'
import { T } from './theme/tokens'
import { useIsDark } from './theme/ThemeContext'


/** 該週還沒有回顧卡時，編輯器帶入的空模板（與既有卡片的結構一致） */
function weeklyTemplate(weekNum: number, startLabel: string, endLabel: string): string {
    return `<h2>第 ${weekNum} 週回顧（${startLabel} - ${endLabel}）</h2>`
        + '<p><strong>這週完成了什麼</strong></p><p></p>'
        + '<p><strong>這週學到什麼</strong></p><p></p>'
        + '<p><strong>卡住的地方 &amp; 解法</strong></p><p></p>'
        + '<p><strong>下週目標（3 件事）</strong></p><p></p>'
        + '<p><strong>需要跟進的白板</strong></p><p></p>'
}

/** 走勢圖看幾週。420px 的左欄放 8 根柱子還很寬鬆 */
const TREND_WEEKS = 8

/**
 * 「這週沒有產出」的一鍵結案內容。
 *
 * 為什麼不是把統計卡換掉就好：使用者自己在第 36／37 週示範過答案——那兩週沒有任何產出，
 * 但卡片沒有留空，內容是「沒有任何產出紀錄。無 commit…」。**空白的一週本身就是值得記下的事實**，
 * 不是該被藏起來的狀態。所以空白週要給的是「把它正式記下來」的動作，不是三個 0。
 * 只填第一段，其餘照常留白——使用者想補脈絡時還有地方寫。
 */
function noOutputContent(weekNum: number, startLabel: string, endLabel: string): string {
    return `<h2>第 ${weekNum} 週回顧（${startLabel} - ${endLabel}）</h2>`
        + '<p><strong>這週完成了什麼</strong></p>'
        + '<p>沒有產出紀錄 —— 這一週沒有任何白板更新、完成的待辦，也沒有新增連結。</p>'
        + '<p><strong>這週學到什麼</strong></p><p></p>'
        + '<p><strong>卡住的地方 &amp; 解法</strong></p><p></p>'
        + '<p><strong>下週目標（3 件事）</strong></p><p></p>'
        + '<p><strong>需要跟進的白板</strong></p><p></p>'
}

/* ------------------------------------------------------------------ WeeklyReviewContent (embeddable) */
interface WeeklyReviewContentProps {
    boards: BoardRecord[]
    onGoToWeeklyCard: () => void
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
}

export function WeeklyReviewContent({ boards, onGoToWeeklyCard, onSaveJournal }: WeeklyReviewContentProps) {
    const isDark = useIsDark()
    // 看哪一段：預設本週，← → 翻到過去／未來
    const [anchor, setAnchor] = useState<Date>(() => new Date())
    /**
     * 週／月／年三個層級。
     * 只有「週」是可寫的卡；月與年是**自動整理、唯讀**——使用者 2026-09-29 選這個方向，
     * 理由是「說不定又沒有時間寫」。再加一層要手寫的東西只會多一個空位。
     */
    const [mode, setMode] = useState<'week' | 'month' | 'year'>('week')

    const { start: weekStart, end: weekEnd, weekNum } = useMemo(() => getWeekRange(anchor), [anchor])
    const weekKey = useMemo(() => getISOWeekKey(anchor), [anchor])
    /** 目前這個層級涵蓋的起訖 ＋ 標題。月／年都以「整段範圍」算統計，不逐週加總 */
    const range = useMemo(() => {
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
        if (mode === 'week') {
            return { start: weekStart, end: weekEnd, title: `第 ${weekNum} 週`, sub: `${fmt(weekStart)} – ${fmt(weekEnd)}` }
        }
        const y = anchor.getFullYear()
        if (mode === 'month') {
            const ws = weeksOfMonth(y, anchor.getMonth())
            const a = getWeekRange(ws[0]), b = getWeekRange(ws[ws.length - 1])
            return { start: a.start, end: b.end, title: `${y} 年 ${anchor.getMonth() + 1} 月`, sub: `第 ${a.weekNum}–${b.weekNum} 週` }
        }
        const firstW = weeksOfMonth(y, 0), lastW = weeksOfMonth(y, 11)
        const a = getWeekRange(firstW[0]), b = getWeekRange(lastW[lastW.length - 1])
        return { start: a.start, end: b.end, title: `${y} 年`, sub: '12 個月' }
    }, [mode, anchor, weekStart, weekEnd, weekNum])

    const stats = useMemo(() => computeRangeStats(boards, range.start, range.end), [boards, range])

    /** 起訖跨年時要帶年份，否則年檢視會顯示成「12/29 – 1/3」，看起來像五天 */
    const rangeLabel = useMemo(() => {
        const sameYear = range.start.getFullYear() === range.end.getFullYear()
        const d = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`
        const dy = (x: Date) => `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`
        return sameYear ? `${d(range.start)} – ${d(range.end)}` : `${dy(range.start)} – ${dy(range.end)}`
    }, [range])

    /** 翻頁：每個層級跨的單位不同。月／年先把日期歸到 1 號，避免 31 號跳月 */
    const step = (delta: number) => setAnchor(a => {
        const r = new Date(a)
        if (mode === 'week') r.setDate(r.getDate() + delta * 7)
        else if (mode === 'month') { r.setDate(1); r.setMonth(r.getMonth() + delta) }
        else { r.setDate(1); r.setFullYear(r.getFullYear() + delta) }
        return r
    })

    const startLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
    const endLabel   = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`
    const hasJournalBoard = boards.some(b => b.isJournal)
    const isCurrentWeek = weekKey === getISOWeekKey(new Date())

    /**
     * 走勢圖資料：最近 8 週各跑一次 computeWeekStats。
     * 視窗跟著 anchor 移動（最右邊＝正在看的那一週），所以它同時是導覽——
     * 現在要翻到第 33 週得按 ← 六次，點柱子一下就到。
     */
    const trend = useMemo(
        () => recentWeekStarts(anchor, TREND_WEEKS).map(ws => {
            const { start, end, weekNum } = getWeekRange(ws)
            return { date: ws, weekNum, ...computeRangeStats(boards, start, end) }
        }),
        [boards, anchor],
    )
    const trendMax = Math.max(1, ...trend.map(t => t.totalCards))

    // 外部寫入卡片後 +1，逼 JournalCardEditor 把新內容讀回來（見該元件的 syncToken）
    const [syncToken, setSyncToken] = useState(0)
    const journalBoardId = boards.find(b => b.isJournal)?.id ?? null

    /**
     * 「記為：這週沒有產出」要不要出現。
     * 兩個條件都成立才給：(1) 這週三項統計全是 0；(2) 卡片還沒被動過——不存在，
     * 或內容與空模板一字不差。已經寫過東西的一週不該被一顆按鈕蓋掉。
     */
    const weekCard = findJournalCard(boards, weekKey)
    const isEmptyWeek = stats.totalCards === 0 && stats.completedTodos === 0 && stats.wikiLinks === 0
    // 與 RC9 的存檔守門共用同一個述詞，免得兩邊對「未動過」的定義漂移
    const cardUntouched = !weekCard || isUntouchedTemplate(weekCard.text, weeklyTemplate(weekNum, startLabel, endLabel))
    const canMarkNoOutput = hasJournalBoard && isEmptyWeek && cardUntouched

    const markNoOutput = () => {
        onSaveJournal(
            weekCard?.boardId ?? journalBoardId ?? '',
            weekKey,
            noOutputContent(weekNum, startLabel, endLabel),
            weekCard?.shapeId ?? null,
        )
        setSyncToken(t => t + 1)
    }

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <button onClick={() => step(-1)} title="上一頁" style={navBtnStyle}>←</button>
                    <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{range.title}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{range.sub}</div>
                    </div>
                    <button onClick={() => step(1)} title="下一頁" style={navBtnStyle}>→</button>
                    {!isCurrentWeek && (
                        <button onClick={() => { setAnchor(new Date()); }} title="回到現在" style={{ ...navBtnStyle, color: T.accent, width: 'auto', padding: '0 8px', fontSize: 12 }}>現在</button>
                    )}
                </div>

                {/* 層級切換。只有「週」可寫，月與年是自動整理 */}
                <div style={{ display: 'flex', gap: 2, background: T.bgApp, borderRadius: 9, padding: 2, marginBottom: 14 }}>
                    {([['week', '週'], ['month', '月'], ['year', '年']] as const).map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setMode(k)}
                            style={{
                                flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                                background: mode === k ? T.bgActive : 'transparent',
                                color: mode === k ? 'white' : T.textSecondary,
                                fontSize: 12, fontWeight: mode === k ? 600 : 400,
                            }}
                        >{label}</button>
                    ))}
                </div>

                {/* RC8 走勢圖。擺在統計卡「上方」是刻意的：它是導覽不是統計，
                    而且要常駐——RC7 的「記為沒有產出」只在空白週出現，兩者放同一層會打架。
                    月／年層級不顯示：那是週粒度的東西，年檢視自己有 12 個月的長條。 */}
                {mode === 'week' && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                        活動走勢 · 近 {TREND_WEEKS} 週
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 38 }}>
                        {trend.map(t => {
                            const isHere = t.weekNum === weekNum
                            const h = 3 + Math.round((t.totalCards / trendMax) * 27)
                            return (
                                <button
                                    key={t.weekNum}
                                    onClick={() => setAnchor(t.date)}
                                    title={`第 ${t.weekNum} 週 — 卡片 ${t.totalCards} · 完成待辦 ${t.completedTodos} · 連結 ${t.wikiLinks}`}
                                    style={{
                                        flex: 1, minWidth: 0, height: '100%', padding: 0, border: 'none',
                                        background: 'transparent', cursor: 'pointer',
                                        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 3,
                                    }}
                                >
                                    <span style={{
                                        display: 'block', height: h, borderRadius: 2,
                                        background: isHere ? T.accent : t.totalCards > 0 ? T.bgActive : T.borderMid,
                                        opacity: isHere || t.totalCards > 0 ? 1 : 0.55,
                                        transition: 'height 0.15s',
                                    }} />
                                    <span style={{ fontSize: 9, color: isHere ? T.accent : '#999', fontWeight: isHere ? 700 : 400 }}>{t.weekNum}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
                )}

                <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                    {mode === 'week' ? (isCurrentWeek ? '本週統計' : '該週統計') : mode === 'month' ? '該月統計' : '全年統計'}
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

                {mode === 'week' && canMarkNoOutput && (
                    <button
                        onClick={markNoOutput}
                        style={{
                            width: '100%', marginTop: 4, padding: '10px 12px', borderRadius: 10,
                            border: `1px dashed ${T.borderLight}`, background: 'transparent',
                            color: T.textSecondary, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = T.bgHover }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        title="把這一週正式記成「沒有產出」，之後回頭看得出來是記過的，不是漏掉的"
                    >
                        <Icon name="done" />記為：這週沒有產出
                    </button>
                )}

                <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.6, padding: '8px 10px', background: noteBg, borderRadius: 8, border: `1px solid ${noteBorder}`, marginTop: 4 }}>
                    統計範圍：{rangeLabel}（整段以週一至週日對齊）有更新記錄的白板
                </div>

                {!hasJournalBoard && (
                    <div style={{ marginTop: 12, padding: '10px 12px', background: '#fffbe6', borderRadius: 8, border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
                        尚未設定 Journal 白板。在白板右鍵選單中選「設為 Journal 白板」即可啟用週回顧卡片。
                    </div>
                )}

                {mode === 'week' && (
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
                )}
            </div>

            {/* 右欄：週＝可寫的回顧卡；月／年＝自動整理（唯讀） */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    padding: '12px 16px', borderBottom: `1px solid ${T.borderLight}`, flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
                        {mode === 'week' ? `第 ${weekNum} 週回顧` : mode === 'month' ? `${range.title} 整理` : `${range.title} 整理`}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{mode === 'week' ? weekKey : '自動整理 · 唯讀'}</span>
                </div>

                {!hasJournalBoard ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <EmptyState
                            icon="cardJournal"
                            title="尚未設定 Journal 白板"
                            hint="在側邊欄的白板上按右鍵，選「設為 Journal 白板」，週回顧就會寫進那塊板。"
                        />
                    </div>
                ) : mode === 'week' ? (
                    <JournalCardEditor
                        boards={boards}
                        dateKey={weekKey}
                        template={weeklyTemplate(weekNum, startLabel, endLabel)}
                        onSaveJournal={onSaveJournal}
                        maxWidth={760}
                        syncToken={syncToken}
                    />
                ) : mode === 'month' ? (
                    <MonthDigest
                        boards={boards}
                        year={anchor.getFullYear()}
                        month={anchor.getMonth()}
                        onOpenWeek={ws => { setAnchor(ws); setMode('week') }}
                    />
                ) : (
                    <YearDigest
                        boards={boards}
                        year={anchor.getFullYear()}
                        onOpenMonth={m => { setAnchor(new Date(anchor.getFullYear(), m, 1)); setMode('month') }}
                    />
                )}
            </div>
        </div>
    )
}
