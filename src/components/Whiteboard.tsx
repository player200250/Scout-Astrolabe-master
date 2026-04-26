import React, { useEffect, useMemo } from 'react'
import { Tldraw, SelectTool, defaultTools, useEditor } from 'tldraw'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { CardShapeUtil, BoardsContext, BacklinksContext } from './card-shape/CardShapeUtil'
import { useBacklinks } from '../hooks/useBacklinks'
import { WhiteboardTools } from './WhiteboardTools'

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
}

export function Whiteboard({ board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onCreateBoard, onSwitchBoard, sidebarWidth, isInboxBoard, onMoveCard, isDark }: WhiteboardProps) {
    const boardInfos = boards.map(b => ({ id: b.id, name: b.name, thumbnail: b.thumbnail }))
    const { forwardLinks, backlinks } = useBacklinks(boards)
    const backlinksValue = useMemo(() => ({
        forwardLinks,
        backlinks,
        boardNames: boards.filter(b => !b.isHome).map(b => b.name),
        currentBoardName: board.name,
    }), [forwardLinks, backlinks, boards, board.name])

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
                        />
                    </Tldraw>
                </BoardsContext.Provider>
            </BacklinksContext.Provider>
        </div>
    )
}
