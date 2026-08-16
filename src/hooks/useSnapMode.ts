// src/hooks/useSnapMode.ts — 把磁吸偏好接到 tldraw editor
//
// 純邏輯在 utils/snapPref.ts，這裡只做 React 那一半。
import { useState, useEffect, useCallback } from 'react'
import type { Editor } from 'tldraw'
import { loadSnapPref, saveSnapPref } from '../utils/snapPref'

export interface UseSnapMode {
    snap: boolean
    toggle: () => void
}

export function useSnapMode(editor: Editor): UseSnapMode {
    const [snap, setSnap] = useState(loadSnapPref)

    // ⚠️ 依賴要帶 editor：切白板時 <Tldraw> 會整個重新掛載、換一個新的 editor 實例，
    //    偏好會回到 tldraw 的預設值，所以每次拿到新 editor 都要重新套用一次。
    useEffect(() => {
        editor.user.updateUserPreferences({ isSnapMode: snap })
    }, [editor, snap])

    const toggle = useCallback(() => {
        setSnap(v => {
            const next = !v
            saveSnapPref(next)
            return next
        })
    }, [])

    return { snap, toggle }
}
