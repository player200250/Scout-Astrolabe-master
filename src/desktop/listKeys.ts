// src/desktop/listKeys.ts — 清單的鍵盤操作（任務、本週到期、最近白板共用）
//
// Tab 在卡片之間跳：每張清單只有第一列在 Tab 順序裡，其他列 tabIndex=-1；
// 進到清單後用 ↑↓（Home／End）移動，Enter 打開（列本身就是 button）。
// 否則五列就是五個 Tab 停留點，六張卡要按很多下才走得完。

import type { KeyboardEvent } from 'react'

export const rowTabIndex = (i: number) => (i === 0 ? 0 : -1)

export function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.dt-row'))
    const i = rows.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const next = e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1)
        : e.key === 'ArrowUp' ? Math.max(i - 1, 0)
        : e.key === 'Home' ? 0
        : e.key === 'End' ? rows.length - 1
        : null
    if (next === null) return
    e.preventDefault()
    rows[next].focus()
}
