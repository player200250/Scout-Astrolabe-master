// src/desktop/useDesktopLayout.ts
//
// 卡片排列的讀寫。存在 main process 的 electron-store（desktop:get-layout／set-layout），
// 不用 localStorage：Desktop 和主視窗同一個 origin，localStorage 是共用的。
// 讀回來一律過 normalizeDesktopLayout：存檔壞了、少了新卡都在那裡收斂。

import { useCallback, useEffect, useState } from 'react'
import { normalizeDesktopLayout, sameDesktopLayout, type DesktopLayout } from '../utils/desktopLayout'

/** null ＝還在讀（畫面先不排卡片，免得藏起來的卡閃一下） */
export function useDesktopLayout(): [DesktopLayout | null, (next: DesktopLayout) => void] {
    const [layout, setLayout] = useState<DesktopLayout | null>(null)

    useEffect(() => {
        let cancelled = false
        const api = window.desktopAPI
        const load = api ? api.getLayout().catch(() => null) : Promise.resolve(null)
        load.then(raw => { if (!cancelled) setLayout(normalizeDesktopLayout(raw)) })
        return () => { cancelled = true }
    }, [])

    const update = useCallback((next: DesktopLayout) => {
        if (layout && sameDesktopLayout(layout, next)) return
        setLayout(next)
        void window.desktopAPI?.setLayout(next).catch(() => false)
    }, [layout])

    return [layout, update]
}
