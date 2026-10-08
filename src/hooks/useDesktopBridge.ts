// src/hooks/useDesktopBridge.ts
//
// 主視窗這一端的 Scout Desktop 接線：
// 1. boards 一變就重算摘要，和上一份不同才送出（摘要很小，但 autosave 很頻繁）
// 2. 接 Desktop 轉來的指令，一律交給既有的 handler 執行——Desktop 自己不寫任何資料
//
// loading 時不發布：否則 Desktop 會先看到一份「0 個任務」的假摘要。

import { useEffect, useRef, useState } from 'react'
import type { BoardRecord } from '../db'
import { buildDesktopSummary, sameDesktopSummary, DESKTOP_NOTE_MAX } from '../utils/desktopSummary'
import type { DesktopSummary } from '../utils/desktopSummary'
import { getTodayStr } from '../utils/date'
import { publishDesktopSummary, onDesktopCommand, canToggleDesktop, toggleDesktopWindow, watchDesktopOpen } from '../platform/desktopBridge'

export interface DesktopBridgeHandlers {
    onOpenBoard: (boardId: string) => void
    onOpenTaskCenter: () => void
    onOpenJournal: () => void
    onQuickCapture: (text: string) => void
}

export interface DesktopBridge {
    /** Scout Desktop 現在是否開著（側邊欄按鈕亮起） */
    desktopOpen: boolean
    /** 開／關；非 Electron 環境為 undefined ⇒ 不顯示入口 */
    toggleDesktop: (() => void) | undefined
}

const toggle = () => { void toggleDesktopWindow() }

export function useDesktopBridge(boards: BoardRecord[], loading: boolean, handlers: DesktopBridgeHandlers): DesktopBridge {
    const [desktopOpen, setDesktopOpen] = useState(false)
    useEffect(() => watchDesktopOpen(setDesktopOpen), [])

    // 「今天」存成 state：跨過午夜後 Desktop 會送 refresh，換日才會觸發重算
    const [today, setToday] = useState(getTodayStr)
    const lastRef = useRef<DesktopSummary | null>(null)

    useEffect(() => {
        if (loading) return
        const next = buildDesktopSummary(boards, today, Date.now())
        if (sameDesktopSummary(lastRef.current, next)) return
        lastRef.current = next
        publishDesktopSummary(next)
    }, [boards, loading, today])

    // handler 與 boards 放 ref：訂閱只建一次，不會因為每次存檔就重訂
    const handlersRef = useRef(handlers)
    const boardsRef = useRef(boards)
    useEffect(() => {
        handlersRef.current = handlers
        boardsRef.current = boards
    })

    useEffect(() => onDesktopCommand(cmd => {
        const h = handlersRef.current
        switch (cmd.type) {
            case 'open-board': {
                // 主視窗再確認一次：存在、不在垃圾桶；日誌板與資料夾不能切進去（RC17）
                const b = boardsRef.current.find(x => x.id === cmd.boardId)
                if (b && !b.deletedAt && !b.isJournal && !b.isFolder) h.onOpenBoard(b.id)
                break
            }
            case 'open-task-center': h.onOpenTaskCenter(); break
            case 'open-journal': h.onOpenJournal(); break
            case 'quick-capture': {
                const text = typeof cmd.text === 'string' ? cmd.text.trim() : ''
                if (text && text.length <= DESKTOP_NOTE_MAX) h.onQuickCapture(text)
                break
            }
            case 'refresh': setToday(getTodayStr()); break
        }
    }), [])

    return { desktopOpen, toggleDesktop: canToggleDesktop() ? toggle : undefined }
}
