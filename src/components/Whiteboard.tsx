import React, { useEffect, useMemo } from 'react'
import { Tldraw, SelectTool, defaultTools, useEditor } from 'tldraw'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { CardShapeUtil, BoardsContext, BacklinksContext } from './card-shape/CardShapeUtil'
import { CustomFrameShapeUtil } from './CustomFrameShapeUtil'
import { useBacklinks } from '../hooks/useBacklinks'
import { WhiteboardTools } from './WhiteboardTools'
import { Dashboard } from './Dashboard'
import { ErrorBoundary } from './ErrorBoundary'

class CustomSelectTool extends SelectTool {
    static id = 'select' as const
    override onDoubleClick() { return }
}

const customTools = defaultTools.map(tool =>
    tool.id === 'select' ? CustomSelectTool : tool
)

function ThemeSync({ isDark }: { isDark: boolean }) {
    const editor = useEditor()
    useEffect(() => {
        editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })
    }, [editor, isDark])
    return null
}

interface WhiteboardProps {
    board: BoardRecord
    boards: BoardRecord[]
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail?: string | null) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    onOpenQuickSwitcher?: () => void
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    sidebarWidth: number
    isInboxBoard: boolean
    onMoveCard: (shapeIds: string[]) => void
    isDark: boolean
    onOpenTaskCenter: () => void
    onOpenReviewCenter: () => void
    onOpenKnowledgeGraph: () => void
    onOpenCardLibrary: () => void
    onOpenOverview: () => void
    onQuickCapture: () => void
    onCardTrashed?: () => void
    recentlyTrashedShapeIds: React.MutableRefObject<Set<string>>
}

export function Whiteboard({
    board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onOpenQuickSwitcher,
    onCreateBoard, onSwitchBoard, sidebarWidth, isInboxBoard, onMoveCard, isDark,
    onOpenTaskCenter, onOpenReviewCenter, onOpenKnowledgeGraph,
    onOpenCardLibrary, onOpenOverview, onQuickCapture, onCardTrashed,
    recentlyTrashedShapeIds,
}: WhiteboardProps) {
    const boardInfos = boards.map(b => ({ id: b.id, name: b.name, thumbnail: b.thumbnail }))
    const { forwardLinks, backlinks } = useBacklinks(boards)
    const backlinksValue = useMemo(() => ({
        forwardLinks,
        backlinks,
        boardNames: boards.filter(b => !b.isHome).map(b => b.name),
        currentBoardName: board.name,
    }), [forwardLinks, backlinks, boards, board.name])

    // D1：主頁永遠是儀表板，不再有儀表板／白板雙模式（舊主頁畫布內容由 loadAllBoards 搬成普通白板）
    if (board.isHome) {
        return (
            <Dashboard
                boards={boards}
                onSwitch={onSwitchBoard}
                onOpenTaskCenter={onOpenTaskCenter}
                onOpenReviewCenter={onOpenReviewCenter}
                onOpenKnowledgeGraph={onOpenKnowledgeGraph}
                onOpenCardLibrary={onOpenCardLibrary}
                onOpenOverview={onOpenOverview}
                onQuickCapture={onQuickCapture}
                isDark={isDark}
                sidebarWidth={sidebarWidth}
            />
        )
    }

    return (
        <ErrorBoundary name="白板">
            <div
                onDoubleClickCapture={e => { e.stopPropagation(); e.preventDefault() }}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: sidebarWidth,
                    bottom: 0,
                    transition: 'right 0.2s cubic-bezier(0.4,0,0.2,1)',
                }}
            >
                <BacklinksContext.Provider value={backlinksValue}>
                    <BoardsContext.Provider value={boardInfos}>
                        <Tldraw hideUi={true} tools={customTools} shapeUtils={[CardShapeUtil, CustomFrameShapeUtil]}>
                            <ThemeSync isDark={isDark} />
                            <WhiteboardTools
                                board={board}
                                boards={boards}
                                onSaveBoard={onSaveBoard}
                                jumpRef={jumpRef}
                                onOpenSearch={onOpenSearch}
                                onOpenHotkey={onOpenHotkey}
                                onOpenQuickSwitcher={onOpenQuickSwitcher}
                                onCreateBoard={onCreateBoard}
                                onSwitchBoard={onSwitchBoard}
                                isInboxBoard={isInboxBoard}
                                onMoveCard={onMoveCard}
                                isDark={isDark}
                                onCardTrashed={onCardTrashed}
                                recentlyTrashedShapeIds={recentlyTrashedShapeIds}
                            />
                        </Tldraw>
                    </BoardsContext.Provider>
                </BacklinksContext.Provider>
            </div>
        </ErrorBoundary>
    )
}
