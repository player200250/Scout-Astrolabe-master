import { useState, useCallback } from 'react'

/**
 * 側邊欄收合狀態：以 localStorage 持久化。
 * - sidebarCollapsed：初始值讀自 localStorage('sidebar-collapsed')。
 * - handleToggleCollapse：切換並寫回 localStorage。
 */
export function useSidebar() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
    })

    const handleToggleCollapse = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev
            try { localStorage.setItem('sidebar-collapsed', String(next)) } catch { /* empty */ }
            return next
        })
    }, [])

    return { sidebarCollapsed, handleToggleCollapse }
}
