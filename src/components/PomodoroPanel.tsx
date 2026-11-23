// src/components/PomodoroPanel.tsx — 番茄鐘面板
//
// 只是 usePomodoro 的顯示層：不持有任何計時狀態，關掉面板計時器照跑
//（狀態掛在 App，見 hooks/usePomodoro.ts 開頭的說明）。
import { SideDrawer } from './ui/SideDrawer'
import { Icon } from './ui/icons'
import { T } from '../theme/tokens'
import { PRESETS, formatRemaining, phaseLabel, phaseAccent, progress, LONG_BREAK_EVERY } from '../utils/pomodoro'
import type { UsePomodoro } from '../hooks/usePomodoro'
import type { BoardRecord } from '../db'
import { useMemo, useState } from 'react'
import { isSoundOn, setSoundOn } from '../utils/chime'
import { scanBoards } from '../utils/todoScan'

const RING = 168
const STROKE = 10

export interface PomodoroPanelProps extends UsePomodoro {
    onClose: () => void
    /** 查綁的待辦在哪塊白板、累積幾個番茄 */
    boards: BoardRecord[]
    /** 換綁：打開任務中心挑 */
    onPickTask: () => void
}

const keyOf = (t: { boardId: string; shapeId: string; todoId: string }) => `${t.boardId}|${t.shapeId}|${t.todoId}`

export function PomodoroPanel({
    state, remaining, running, idle, totalMs,
    onStart, onPause, onReset, onSkip, onSetPreset, onLinkTask, onClose, boards, onPickTask,
}: PomodoroPanelProps) {
    const linked = state.linkedTask
    // 綁的那項還在、而且沒勾掉才查得到；查不到就標「已完成或已刪除」，不假裝沒綁。
    const linkedTask = useMemo(() => {
        if (!linked) return null
        const key = keyOf(linked)
        return scanBoards(boards).find(t => !t.checked && keyOf(t) === key) ?? null
    }, [boards, linked])
    const [showHelp, setShowHelp] = useState(false)
    const [soundOn, setSoundOnState] = useState(isSoundOn)
    const done = progress(state, Date.now())
    const r = (RING - STROKE) / 2
    const circumference = 2 * Math.PI * r
    const accent = phaseAccent(state.phase)

    return (
        <SideDrawer
            title="番茄鐘"
            titleIcon="pomodoro"
            onClose={onClose}
            badge={
                <span style={{ fontSize: 11, color: T.textMuted }}>
                    今天 {state.completedFocus} 個
                </span>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 12, color: T.textSecondary }}>
                    {phaseLabel(state.phase)}
                    {state.phase === 'focus' && (
                        <span style={{ color: T.textMuted }}>
                            　·　再 {LONG_BREAK_EVERY - (state.completedFocus % LONG_BREAK_EVERY)} 個進長休息
                        </span>
                    )}
                </div>

                <div style={{ position: 'relative', width: RING, height: RING }}>
                    <svg width={RING} height={RING} style={{ transform: 'rotate(-90deg)' }}>
                        <circle
                            cx={RING / 2} cy={RING / 2} r={r}
                            fill="none" stroke={T.borderLight} strokeWidth={STROKE}
                        />
                        <circle
                            cx={RING / 2} cy={RING / 2} r={r}
                            fill="none" stroke={accent} strokeWidth={STROKE} strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference * (1 - done)}
                        />
                    </svg>
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 2,
                    }}>
                        <span style={{
                            fontSize: 34, fontWeight: 600, color: T.textPrimary,
                            // 等寬數字：不然秒數跳動時整串字會左右抖。
                            fontVariantNumeric: 'tabular-nums',
                        }}>{formatRemaining(remaining)}</span>
                        <span style={{ fontSize: 11, color: T.textMuted }}>
                            共 {Math.round(totalMs / 60000)} 分鐘
                        </span>
                    </div>
                </div>

                {/* 正在做：原本是原生下拉（27 項、最長 101 字、不能搜尋，綁好後只露出半句）。
                    換綁改走全螢幕任務中心，那邊有搜尋，按「專注」就綁好回來。 */}
                <div data-testid="pomodoro-linked" style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
                    border: `1px solid ${linked ? accent : T.borderLight}`,
                    background: linked ? `${accent}14` : 'transparent',
                }}>
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>正在做</div>
                    {linked ? (
                        <>
                            <div style={{
                                fontSize: 14, fontWeight: 600, lineHeight: 1.45,
                                color: linkedTask ? T.textPrimary : T.textMuted,
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                overflow: 'hidden', wordBreak: 'break-word',
                            }} title={linked.text}>
                                {linked.text}{!linkedTask && '（已完成或已刪除）'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: T.textMuted }}>
                                {linkedTask && (
                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {linkedTask.boardName}{linkedTask.focusCount > 0 ? ` · ${linkedTask.focusCount} 個番茄` : ''}
                                    </span>
                                )}
                                <span style={{ flex: 1 }} />
                                <LinkButton label="換一項" onClick={onPickTask} />
                                {/* 綁的已完成／刪除時也要能解除，不然只能換綁、回不到「不綁」 */}
                                <LinkButton label="解除" onClick={() => onLinkTask(null)} />
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: T.textSecondary, flex: 1 }}>沒有綁待辦（只算今天的番茄數）</span>
                            <LinkButton label="從任務中心挑" onClick={onPickTask} />
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    {running ? (
                        <PomodoroButton icon="pause" label="暫停" onClick={onPause} primary accent={accent} />
                    ) : (
                        <PomodoroButton icon="play" label={idle ? '開始' : '繼續'} onClick={onStart} primary accent={accent} />
                    )}
                    <PomodoroButton icon="reset" label="重設" onClick={onReset} />
                    <PomodoroButton icon="skip" label="跳過" onClick={onSkip} />
                </div>

                <div style={{ width: '100%', borderTop: `1px solid ${T.borderLight}`, paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
                        長度
                        {/* 說明收起來：每次打開都掛著兩行字，用過一次就不必再看（UI/UX 稽核第 5 點） */}
                        <button
                            title={showHelp ? '收起說明' : '跳過和換長度怎麼算'}
                            aria-expanded={showHelp}
                            onClick={() => setShowHelp(v => !v)}
                            style={{
                                width: 16, height: 16, borderRadius: '50%', padding: 0, cursor: 'pointer',
                                fontSize: 10, lineHeight: '14px', textAlign: 'center',
                                border: `1px solid ${showHelp ? accent : T.borderMid}`,
                                color: showHelp ? accent : T.textMuted, background: 'transparent',
                            }}
                        >?</button>
                        <span style={{ flex: 1 }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                            <input
                                type="checkbox" checked={soundOn}
                                onChange={e => { setSoundOn(e.target.checked); setSoundOnState(e.target.checked) }}
                            />
                            提示音
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {PRESETS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => onSetPreset(p.id)}
                                style={{
                                    flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                                    fontSize: 12,
                                    border: `1px solid ${state.presetId === p.id ? accent : T.borderLight}`,
                                    // 底色跟框線同色系：原本固定 accentBg（藍），休息時變成綠框配藍底。
                                    background: state.presetId === p.id ? `${accent}24` : 'transparent',
                                    color: state.presetId === p.id ? accent : T.textSecondary,
                                }}
                            >{p.label}</button>
                        ))}
                    </div>
                    {showHelp && (
                        <div data-testid="pomodoro-help" style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.7 }}>
                            跑到一半換長度會停下來重算，按開始重來。<br />
                            <strong>跳過不計入番茄數</strong>，只有跑完的專注才算；有綁待辦的話也記到那一項。
                        </div>
                    )}
                </div>
            </div>
        </SideDrawer>
    )
}

function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                fontSize: 11, color: T.accent, background: T.accentBg,
                border: `1px solid ${T.accentBorder}`, borderRadius: 6,
                padding: '2px 8px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
        >{label}</button>
    )
}

function PomodoroButton({
    icon, label, onClick, primary, accent,
}: {
    icon: 'play' | 'pause' | 'reset' | 'skip'
    label: string
    onClick: () => void
    primary?: boolean
    accent?: string
}) {
    return (
        <button
            onClick={onClick}
            style={{
                // ⚠️ inline-flex 不能省：<Icon> 的 svg 是 display:block，
                // 放進預設 inline-block 的按鈕會自己占一行，圖示會疊到文字上面。
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
                border: `1px solid ${primary ? (accent ?? T.borderLight) : T.borderLight}`,
                background: primary ? (accent ?? 'transparent') : 'transparent',
                color: primary ? '#fff' : T.textSecondary,
            }}
        >
            <Icon name={icon} size="sm" />{label}
        </button>
    )
}
