// src/components/PomodoroPanel.tsx — 番茄鐘面板
//
// 只是 usePomodoro 的顯示層：不持有任何計時狀態，關掉面板計時器照跑
//（狀態掛在 App，見 hooks/usePomodoro.ts 開頭的說明）。
import { SideDrawer } from './ui/SideDrawer'
import { Icon } from './ui/icons'
import { T } from '../theme/tokens'
import { PRESETS, formatRemaining, phaseLabel, progress, LONG_BREAK_EVERY } from '../utils/pomodoro'
import type { UsePomodoro } from '../hooks/usePomodoro'

const RING = 168
const STROKE = 10

export interface PomodoroPanelProps extends UsePomodoro {
    onClose: () => void
}

export function PomodoroPanel({
    state, remaining, running, idle, totalMs,
    onStart, onPause, onReset, onSkip, onSetPreset, onClose,
}: PomodoroPanelProps) {
    const done = progress(state, Date.now())
    const r = (RING - STROKE) / 2
    const circumference = 2 * Math.PI * r
    // 專注是藍的、休息是綠的——一眼分辨現在該工作還是該離開椅子。
    const accent = state.phase === 'focus' ? '#2563eb' : '#16a34a'

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
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>長度</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {PRESETS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => onSetPreset(p.id)}
                                style={{
                                    flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                                    fontSize: 12,
                                    border: `1px solid ${state.presetId === p.id ? accent : T.borderLight}`,
                                    background: state.presetId === p.id ? T.accentBg : 'transparent',
                                    color: state.presetId === p.id ? accent : T.textSecondary,
                                }}
                            >{p.label}</button>
                        ))}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.7 }}>
                        跑到一半換長度會停下來重算，按開始重來。<br />
                        <strong>跳過不計入番茄數</strong>，只有跑完的專注才算。
                    </div>
                </div>
            </div>
        </SideDrawer>
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
