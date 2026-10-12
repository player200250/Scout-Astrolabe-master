// src/desktop/SearchBox.tsx — 標題列的搜尋框：Enter 在主視窗打開快速切換並帶入這個字
// 跟快速筆記一樣，主視窗回 ok 才清空；沒就緒時停用。Esc 清空。

import { useState } from 'react'
import { DESKTOP_SEARCH_MAX } from '../utils/desktopSummary'
import { sendDesktopCommand } from './useDesktopSummary'

export function SearchBox({ connected }: { connected: boolean }) {
    const [query, setQuery] = useState('')

    const search = async () => {
        if (!connected || !query.trim()) return
        const res = await sendDesktopCommand({ type: 'search', query: query.trim() })
        if (res.ok) setQuery('')
    }

    return (
        <input
            className="dt-search"
            type="search"
            value={query}
            maxLength={DESKTOP_SEARCH_MAX}
            disabled={!connected}
            placeholder={connected ? '搜尋白板… Enter' : '等待 Scout…'}
            aria-label="搜尋白板，按 Enter 在 Scout 打開"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void search() }
                else if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
            }}
        />
    )
}
