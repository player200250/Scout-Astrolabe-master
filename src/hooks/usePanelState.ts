// src/hooks/usePanelState.ts
//
// A1 — 統一管理 App.tsx 的面板開關 state。
// 原本 App.tsx 直接持有 14 個 boolean useState（searchOpen / hotkeyOpen / …），
// 每新增一個面板就要再加一組 state + setter，且必須一路 prop drilling 傳下去。
// 這裡集中成一個 hook，對外只暴露 { panels, openPanel, closePanel, togglePanel, showOnly }，
// 之後新增面板只要在 PanelName union 加一個名字即可。
import { useState, useCallback, useMemo } from 'react'

export type PanelName =
    | 'search'
    | 'hotkey'
    | 'overview'
    | 'taskCenter'
    | 'filter'
    | 'reviewCenter'
    | 'backup'
    | 'knowledgeGraph'
    | 'pomodoro'
    | 'cardLibrary'
    | 'quickCapture'
    | 'onboarding'
    | 'trash'
    | 'quickSwitcher'
    | 'overdueBanner'
    | 'dataSafety'
    | 'commandPalette'
    | 'inboxTriage'
    | 'tagManager'
    | 'cloudSync'

export type PanelState = Record<PanelName, boolean>

export const PANEL_NAMES: PanelName[] = [
    'search', 'hotkey', 'overview', 'taskCenter', 'filter',
    'reviewCenter', 'backup', 'knowledgeGraph', 'pomodoro', 'cardLibrary',
    'quickCapture', 'onboarding', 'trash', 'quickSwitcher', 'overdueBanner',
    'dataSafety', 'commandPalette', 'inboxTriage', 'tagManager', 'cloudSync',
]

/**
 * showOnlyPanel 可以順手關掉的面板：關了不會丟東西。
 * 不在名單裡的都留著——quickCapture、tagManager（改名）有打到一半的字；reviewCenter 的日記
 * 編輯器 900ms 才存檔、卸載會丟掉還沒存的；onboarding、cloudSync 是流程；pomodoro、overdueBanner 不擋畫面。
 */
export const PANELS_SAFE_TO_CLOSE: readonly PanelName[] = [
    'search', 'hotkey', 'overview', 'taskCenter', 'filter', 'backup', 'knowledgeGraph',
    'cardLibrary', 'trash', 'quickSwitcher', 'dataSafety', 'commandPalette', 'inboxTriage',
]

/**
 * 只留 name（和不能隨便關的面板）。面板各自開關、疊放高度又不同，從外面（Scout Desktop）叫面板時
 * 看不到主視窗開著什麼：收件匣整理開著再叫資料安全中心，新的會被蓋在下面，看起來像沒反應。
 * name 傳 null＝只收掉面板（例如切白板）。
 */
export function showOnlyPanel(prev: PanelState, name: PanelName | null): PanelState {
    let next = prev
    for (const other of PANELS_SAFE_TO_CLOSE) {
        if (other !== name && next[other]) next = { ...next, [other]: false }
    }
    if (name && !next[name]) next = { ...next, [name]: true }
    return next
}

const INITIAL_STATE: PanelState = Object.fromEntries(
    PANEL_NAMES.map(name => [name, false]),
) as PanelState

export interface UsePanelState {
    panels: PanelState
    openPanel: (name: PanelName) => void
    closePanel: (name: PanelName) => void
    togglePanel: (name: PanelName) => void
    showOnly: (name: PanelName | null) => void
}

export function usePanelState(): UsePanelState {
    const [panels, setPanels] = useState<PanelState>(INITIAL_STATE)

    // 三個 setter 都用「值沒變就回傳原物件」避免無謂 re-render，並各自只依賴 setPanels（穩定）。
    const openPanel = useCallback((name: PanelName) => {
        setPanels(prev => (prev[name] ? prev : { ...prev, [name]: true }))
    }, [])

    const closePanel = useCallback((name: PanelName) => {
        setPanels(prev => (prev[name] ? { ...prev, [name]: false } : prev))
    }, [])

    const togglePanel = useCallback((name: PanelName) => {
        setPanels(prev => ({ ...prev, [name]: !prev[name] }))
    }, [])

    const showOnly = useCallback((name: PanelName | null) => {
        setPanels(prev => showOnlyPanel(prev, name))
    }, [])

    return useMemo(
        () => ({ panels, openPanel, closePanel, togglePanel, showOnly }),
        [panels, openPanel, closePanel, togglePanel, showOnly],
    )
}
