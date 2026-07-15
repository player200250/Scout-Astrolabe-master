// src/hooks/usePanelState.ts
//
// A1 — 統一管理 App.tsx 的面板開關 state。
// 原本 App.tsx 直接持有 14 個 boolean useState（searchOpen / hotkeyOpen / …），
// 每新增一個面板就要再加一組 state + setter，且必須一路 prop drilling 傳下去。
// 這裡集中成一個 hook，對外只暴露 { panels, openPanel, closePanel, togglePanel }，
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

export type PanelState = Record<PanelName, boolean>

export const PANEL_NAMES: PanelName[] = [
    'search', 'hotkey', 'overview', 'taskCenter', 'filter',
    'reviewCenter', 'backup', 'knowledgeGraph', 'cardLibrary',
    'quickCapture', 'onboarding', 'trash', 'quickSwitcher', 'overdueBanner',
    'dataSafety', 'commandPalette', 'inboxTriage', 'tagManager',
]

const INITIAL_STATE: PanelState = Object.fromEntries(
    PANEL_NAMES.map(name => [name, false]),
) as PanelState

export interface UsePanelState {
    panels: PanelState
    openPanel: (name: PanelName) => void
    closePanel: (name: PanelName) => void
    togglePanel: (name: PanelName) => void
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

    return useMemo(
        () => ({ panels, openPanel, closePanel, togglePanel }),
        [panels, openPanel, closePanel, togglePanel],
    )
}
