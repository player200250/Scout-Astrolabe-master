// src/components/SettingsPanel.tsx — 設定（全螢幕）
//
// 原本設定散在四處：托盤右鍵選單（最小化到托盤、開機啟動、允許 Claude Code 連線）、
// 側欄底部（主題）、各自的面板（雲端同步、備份、資料安全、快捷鍵）、番茄鐘面板（提示音）。
// 托盤那三項最難找——桌面版 Claude 就是找不到「允許 Claude Code 連線」才斷線。
//
// 這頁只是集中入口：系統層的開關讀寫 main.js 那份狀態（跟托盤同一份，任一邊改另一邊會跟上）；
// 已經有自己面板的功能只放一個按鈕連過去，不在這裡重做一份。
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

export function SettingsPanel({ onClose, onToggleTheme, onOpenPanel }: SettingsPanelProps) {
    const isDark = useIsDark()
    const api = window.electronAPI
    // null＝還在讀，或不是桌面版（手機／瀏覽器沒有托盤）
    const [sys, setSys] = useState<AppSettings | null>(null)
    const [sound, setSound] = useState(isSoundOn)

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

    return (
        <FullscreenPanel title="設定" titleIcon="settings" onClose={onClose}>
            <style>{`.settings-rows > * + * { border-top: 1px solid ${T.borderLight} !important; }`}</style>
            <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Section title="一般">
                    <ToggleRow
                        label="深色模式" checked={isDark} onChange={() => onToggleTheme()}
                    />
                    {sys && (
                        <ToggleRow
                            label="關閉視窗時最小化到托盤"
                            hint="關掉的話，按視窗的 ✕ 就會結束程式"
                            checked={sys.minimizeToTray} onChange={v => setSysKey('minimizeToTray', v)}
                        />
                    )}
                    {sys && sys.openAtLogin !== null && (
                        <ToggleRow
                            label="開機時自動啟動"
                            checked={sys.openAtLogin} onChange={v => setSysKey('openAtLogin', v)}
                        />
                    )}
                </Section>

                <Section title="連線">
                    {sys && (
                        <ToggleRow
                            label="允許 Claude Code 連線"
                            hint="讓 Claude Code 讀寫白板（收件匣、待辦）。關掉後它的 Scout 工具會連不上"
                            checked={sys.mcpEnabled} onChange={v => setSysKey('mcpEnabled', v)}
                        />
                    )}
                    <LinkRow icon="cloudSync" label="雲端同步" onClick={() => onOpenPanel('cloudSync')} />
                </Section>

                <Section title="資料">
                    <LinkRow icon="backup" label="備份" onClick={() => onOpenPanel('backup')} />
                    <LinkRow icon="dataSafety" label="資料安全中心" onClick={() => onOpenPanel('dataSafety')} />
                </Section>

                <Section title="其他">
                    <ToggleRow
                        label="番茄鐘提示音" hint="專注或休息結束時播一聲"
                        checked={sound} onChange={v => { setSoundOn(v); setSound(v) }}
                    />
                    <LinkRow icon="hotkey" label="快捷鍵一覽" onClick={() => onOpenPanel('hotkey')} />
                </Section>

                {!api && (
                    <div style={{ fontSize: 12, color: T.textMuted }}>這個版本沒有托盤，托盤相關的設定不會顯示。</div>
                )}
            </div>
        </FullscreenPanel>
    )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, margin: '0 0 6px 4px' }}>{title}</div>
            {/* 分隔線只畫在列與列之間：每列自帶底線的話，最後一列會跟外框疊成粗線 */}
            <div className="settings-rows" style={{ background: T.bgCard, border: `1px solid ${T.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
                {children}
            </div>
        </section>
    )
}

const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    fontSize: 14, color: T.textPrimary,
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label style={{ ...rowStyle, cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div>{label}</div>
                {hint && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{hint}</div>}
            </div>
            <input
                type="checkbox" role="switch" checked={checked}
                onChange={e => onChange(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
            />
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
