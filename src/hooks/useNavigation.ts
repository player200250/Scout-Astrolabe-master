import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { INBOX_BOARD_ID, JUMP_DELAY_MS } from '../constants'

/** useNavigation 需共用的核心 board state（由 useBoardManager 傳入） */
export interface NavigationSharedState {
    activeBoardId: string | null
    setActiveBoardId: Dispatch<SetStateAction<string | null>>
}

/**
 * 導航領域：白板返回堆疊、跳轉到卡片、前往 Inbox。
 * - navigationStack / setNavigationStack / jumpRef 也供合成層的跨領域 handler
 *   （switch / switchToChild / setParent / new / goToWeeklyCard）使用，故一併回傳。
 * - jumpRef 由 Whiteboard 在掛載時注入實際跳轉函式。
 */
export function useNavigation(state: NavigationSharedState) {
    const { activeBoardId, setActiveBoardId } = state
    const [navigationStack, setNavigationStack] = useState<string[]>([])
    const jumpRef = useRef<((shapeId: string, x: number, y: number) => void) | null>(null)

    const handleBack = useCallback(() => {
        setNavigationStack(prev => {
            if (prev.length <= 1) return prev
            const newStack = prev.slice(0, -1)
            setActiveBoardId(newStack[newStack.length - 1])
            return newStack
        })
    }, [setActiveBoardId])

    const handleJump = useCallback((boardId: string, shapeId: string, x: number, y: number) => {
        if (boardId !== activeBoardId) {
            setActiveBoardId(boardId)
            setTimeout(() => jumpRef.current?.(shapeId, x, y), JUMP_DELAY_MS)
        } else {
            jumpRef.current?.(shapeId, x, y)
        }
    }, [activeBoardId, setActiveBoardId])

    const handleGoToInbox = useCallback(() => {
        setActiveBoardId(INBOX_BOARD_ID)
        setNavigationStack([INBOX_BOARD_ID])
    }, [setActiveBoardId])

    return {
        navigationStack,
        setNavigationStack,
        jumpRef,
        handleBack,
        handleJump,
        handleGoToInbox,
    }
}
