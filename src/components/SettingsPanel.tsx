// src/components/SettingsPanel.tsx — 設定（全螢幕）
//
// 原本設定散在四處：托盤右鍵選單（最小化到托盤、開機啟動、允許 Claude Code 連線）、
// 側欄底部（主題）、各自的面板（雲端同步、備份、資料安全、快捷鍵）、番茄鐘面板（提示音）。
// 托盤那三項最難找——桌面版 Claude 就是找不到「允許 Claude Code 連線」才斷線。
//
// 這頁只是集中入口：系統層的開關讀寫 main.js 那份狀態（跟托盤同一份，任一邊改另一邊會跟上）；
// 已經有自己面板的功能只放一個按鈕連過去，不在這裡重做一份。
//
// 版面（2026-11-23 使用者拍板）：左分類、右內容。原本單欄 640px 置中，寬螢幕兩側空一大片；
// 勾勾放在最右邊，跟文字隔太遠。
import { useEffect, useState, type ReactNode } from 'react'
import { FullscreenPanel } from './ui/FullscreenPanel'
import { Icon, type IconName } from './ui/icons'
import { T } from '../theme/tokens'
import { useIsDark } from '../theme/ThemeContext'
import { isSoundOn, setSoundOn } from '../utils/chime'
import type { AppSettings, AppSettingKey } from '../electron-api'
import type { PanelName } from '../hooks/usePanelState'

interface SettingsPanelProps {
    onClose: () => void
    onToggleTheme: () => void
    /** 連到既有面板（會先關掉設定頁） */
    onOpenPanel: (name: PanelName) => void
}

type CategoryId = 'appearance' | 'window' | 'pomodoro' | 'connection' | 'data' | 'help'

const CATEGORIES: { id: CategoryId; label: string; icon: IconName }[] = [
    { id: 'appearance', label: '外觀', icon: 'themeDark' },
    { id: 'window', label: '視窗與啟動', icon: 'desktopWidget' },
    { id: 'pomodoro', label: '番茄鐘', icon: 'pomodoro' },
    { id: 'connection', label: '連線與同步', icon: 'cloudSync' },
    { id: 'data', label: '資料', icon: 'dataSafety' },
    { id: 'help', label: '說明', icon: 'onboarding' },
]

export function SettingsPanel({ onClose, onToggleTheme, onOpenPanel }: SettingsPanelProps) {
    const isDark = useIsDark()
    const api = window.electronAPI
    // null＝還在讀，或不是桌面版（手機／瀏覽器沒有托盤）
    const [sys, setSys] = useState<AppSettings | null>(null)
    const [sound, setSound] = useState(isSoundOn)
    const [category, setCategory] = useState<CategoryId>('appearance')

    useEffect(() => {
        let alive = true
        api?.getAppSettings?.().then(s => { if (alive) setSys(s) }).catch(() => { /* 舊版 preload：當作沒有 */ })
        const off = api?.onAppSettingsChanged?.(s => setSys(s))
        return () => { alive = false; off?.() }
    }, [api])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const setSysKey = (key: AppSettingKey, value: boolean) => {
        // 以 main 回傳的為準：開機啟動寫入失敗時，勾勾要跳回去
        api?.setAppSetting?.(key, value).then(setSys).catch(() => { /* 保持原值 */ })
    }

    const content: Record<CategoryId, ReactNode> = {
        appearance: (
            <Rows>
                <ToggleRow label="深色模式" checked={isDark} onChange={() => onToggleTheme()} />
            </Rows>
        ),
        window: sys ? (
            <Rows>
                <ToggleRow
                    label="關閉視窗時最小化到托盤" hint="關掉的話，按視窗的 ✕ 就會結束程式"
                    checked={sys.minimizeToTray} onChange={v => setSysKey('minimizeToTray', v)}
                />
                {sys.openAtLogin !== null
                    ? <ToggleRow label="開機時自動啟動" checked={sys.openAtLogin} onChange={v => setSysKey('openAtLogin', v)} />
                    : <Note>開機時自動啟動：只有安裝版能設定。</Note>}
            </Rows>
        ) : <Rows><Note>這個版本沒有托盤，這一類的設定不會顯示。</Note></Rows>,
        pomodoro: (
            <Rows>
                <ToggleRow
                    label="提示音" hint="專注或休息結束時播一聲"
                    checked={sound} onChange={v => { setSoundOn(v); setSound(v) }}
                />
            </Rows>
        ),
        connection: (
            <Rows>
                {sys
                    ? <ToggleRow
                        label="允許 Claude Code 連線"
                        hint="讓 Claude Code 讀寫白板（收件匣、待辦）。關掉後它的 Scout 工具會連不上"
                        checked={sys.mcpEnabled} onChange={v => setSysKey('mcpEnabled', v)}
                    />
                    : <Note>這個版本不能讓 Claude Code 連線。</Note>}
                <LinkRow icon="cloudSync" label="雲端同步" onClick={() => onOpenPanel('cloudSync')} />
            </Rows>
        ),
        data: (
            <Rows>
                <LinkRow icon="backup" label="備份" onClick={() => onOpenPanel('backup')} />
                <LinkRow icon="dataSafety" label="資料安全中心" onClick={() => onOpenPanel('dataSafety')} />
            </Rows>
        ),
        help: (
            <Rows>
                <LinkRow icon="hotkey" label="快捷鍵一覽" onClick={() => onOpenPanel('hotkey')} />
                <LinkRow icon="onboarding" label="使用導覽" onClick={() => onOpenPanel('onboarding')} />
                <LinkRow icon="command" label="命令面板（Ctrl+K）" onClick={() => onOpenPanel('commandPalette')} />
            </Rows>
        ),
    }
    const current = CATEGORIES.find(c => c.id === category)!

    return (
        <FullscreenPanel title="設定" titleIcon="settings" onClose={onClose}>
            <style>{`.settings-rows > * + * { border-top: 1px solid ${T.borderLight} !important; }`}</style>
            <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <nav aria-label="設定分類" style={{ width: 168, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {CATEGORIES.map(c => {
                        const active = c.id === category
                        return (
                            <button
                                key={c.id}
                                onClick={() => setCategory(c.id)}
                                aria-current={active ? 'page' : undefined}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                    borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                                    fontSize: 13, fontWeight: active ? 600 : 400,
                                    background: active ? T.accentBg : 'transparent',
                                    color: active ? T.accent : T.textSecondary,
                                }}
                            ><Icon name={c.icon} />{c.label}</button>
                        )
                    })}
                </nav>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, margin: '6px 0 12px' }}>{current.label}</h2>
                    {content[category]}
                </div>
            </div>
        </FullscreenPanel>
    )
}

/** 分隔線只畫在列與列之間：每列自帶底線的話，最後一列會跟外框疊成粗線 */
function Rows({ children }: { children: ReactNode }) {
    return (
        <div className="settings-rows" style={{ background: T.bgCard, border: `1px solid ${T.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
            {children}
        </div>
    )
}

function Note({ children }: { children: ReactNode }) {
    return <div style={{ padding: '12px 14px', fontSize: 12, color: T.textMuted }}>{children}</div>
}

const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    fontSize: 14, color: T.textPrimary,
}

/** 勾勾在文字左邊：放最右邊時跟文字隔了半個畫面，看不出是哪一列的 */
function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label style={{ ...rowStyle, alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
                type="checkbox" role="switch" checked={checked}
                onChange={e => onChange(e.target.checked)}
                style={{ width: 16, height: 16, margin: '2px 0 0', cursor: 'pointer', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div>{label}</div>
                {hint && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{hint}</div>}
            </div>
        </label>
    )
}

function LinkRow({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                ...rowStyle, width: '100%', background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgCardHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
            <span style={{ color: T.textSecondary, display: 'flex' }}><Icon name={icon} /></span>
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ color: T.textMuted, display: 'flex' }}><Icon name="chevronRight" /></span>
        </button>
    )
}
