import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Tldraw, SelectTool, defaultTools, useEditor } from 'tldraw'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { CardShapeUtil, BoardsContext, BacklinksContext } from './card-shape/CardShapeUtil'
import { useBacklinks } from '../hooks/useBacklinks'
import { WhiteboardTools } from './WhiteboardTools'
import { Dashboard } from './Dashboard'

export type HomeView = 'dashboard' | 'whiteboard'

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
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail: string | null) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    sidebarWidth: number
    isInboxBoard: boolean
    onMoveCard: (shapeId: string) => void
    isDark: boolean
    onOpenTaskCenter: () => void
    onOpenReviewCenter: () => void
    onOpenKnowledgeGraph: () => void
    onOpenCardLibrary: () => void
    onOpenOverview: () => void
    onQuickCapture: () => void
}

export function Whiteboard({
    board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey,
    onCreateBoard, onSwitchBoard, sidebarWidth, isInboxBoard, onMoveCard, isDark,
    onOpenTaskCenter, onOpenReviewCenter, onOpenKnowledgeGraph,
    onOpenCardLibrary, onOpenOverview, onQuickCapture,
}: WhiteboardProps) {
    const boardInfos = boards.map(b => ({ id: b.id, name: b.name, thumbnail: b.thumbnail }))
    const { forwardLinks, backlinks } = useBacklinks(boards)
    const backlinksValue = useMemo(() => ({
        forwardLinks,
        backlinks,
        boardNames: boards.filter(b => !b.isHome).map(b => b.name),
        currentBoardName: board.name,
    }), [forwardLinks, backlinks, boards, board.name])

    const [homeView, setHomeView] = useState<HomeView>(() => {
        try { return (localStorage.getItem('home-view') as HomeView) || 'dashboard' }
        catch { return 'dashboard' }
    })

    const handleSetHomeView = useCallback((v: HomeView) => {
        setHomeView(v)
        try { localStorage.setItem('home-view', v) } catch {}
    }, [])

    if (board.isHome && homeView === 'dashboard') {
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
                homeView={homeView}
                onSetHomeView={handleSetHomeView}
            />
        )
    }

    return (
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
                    <Tldraw hideUi={true} tools={customTools} shapeUtils={[CardShapeUtil]}>
                        <ThemeSync isDark={isDark} />
                        <WhiteboardTools
                            board={board}
                            boards={boards}
                            onSaveBoard={onSaveBoard}
                            jumpRef={jumpRef}
                            onOpenSearch={onOpenSearch}
                            onOpenHotkey={onOpenHotkey}
                            onCreateBoard={onCreateBoard}
                            onSwitchBoard={onSwitchBoard}
                            isInboxBoard={isInboxBoard}
                            onMoveCard={onMoveCard}
                            isDark={isDark}
                            homeView={board.isHome ? homeView : undefined}
                            onSetHomeView={board.isHome ? handleSetHomeView : undefined}
                        />
                    </Tldraw>
                </BoardsContext.Provider>
            </BacklinksContext.Provider>
        </div>
    )
}
