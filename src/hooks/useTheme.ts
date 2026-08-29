// src/hooks/useTheme.ts
//
// TD1 步驟 1 — 把深色模式從 App.tsx 抽出來。
// 三件事本來散在 App.tsx 的三個地方（useState 初值讀 localStorage、toggleTheme 寫回、
// useEffect 套 data-theme），彼此是同一件事卻隔了一百多行，這裡收成一個 hook。
//
// localStorage 全程包 try/catch：隱私模式／被停用時 `localStorage` 存取會直接丟例外，
// 主題只是外觀，不該讓整個 App 開不起來。
import { useState, useEffect, useCallback, useMemo } from 'react'

const STORAGE_KEY = 'theme'

export interface UseTheme {
    isDark: boolean
    toggleTheme: () => void
}

export function useTheme(): UseTheme {
    const [isDark, setIsDark] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) === 'dark' } catch { return false }
    })

    const toggleTheme = useCallback(() => {
        setIsDark(prev => {
            const next = !prev
            try { localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light') } catch { /* empty */ }
            return next
        })
    }, [])

    // 套到 <html> 上，讓 theme/tokens.css 的 var(--…) 換一整組值。
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }, [isDark])

    return useMemo(() => ({ isDark, toggleTheme }), [isDark, toggleTheme])
}
