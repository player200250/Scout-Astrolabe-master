// src/desktop/useDesktopTheme.ts
//
// 主題沿用主 App 的 localStorage 'theme'（同 origin 共用）。
// 主視窗切換時，別的視窗會收到 storage 事件，跟著換 data-theme。

import { useEffect } from 'react'

function apply() {
    let dark = false
    try { dark = localStorage.getItem('theme') === 'dark' } catch { /* 隱私模式等：用淺色 */ }
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

// 模組載入時先套一次：第一次畫面就是對的顏色，不會先閃一下淺色
apply()

export function useDesktopTheme() {
    useEffect(() => {
        const onStorage = (e: StorageEvent) => { if (e.key === 'theme' || e.key === null) apply() }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])
}
