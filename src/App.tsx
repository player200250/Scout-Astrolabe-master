import { useState, useEffect, useCallback } from 'react'
import { useBoardManager } from './hooks/useBoardManager'
import { Whiteboard } from './components/Whiteboard'
import { BoardTabBar } from './components/BoardTabBar'
import { BoardOverview } from './components/BoardOverview'
import { MoveCardModal } from './components/MoveCardModal'
import { SearchPanel } from './SearchPanel'
import { TaskCenter } from './TaskCenter'
import { FilterPanel } from './FilterPanel'
import { BackupPanel } from './BackupPanel'
import { ReviewCenter } from './ReviewCenter'
import { HotkeyPanel } from './HotkeyPanel'
import { KnowledgeGraph } from './KnowledgeGraph'
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, INBOX_BOARD_ID } from './constants'
import 'tldraw/tldraw.css'

declare global {
    interface Window {
        electronAPI: {
            saveDocument: (data: string) => void
            loadDocument: () => Promise<any>
            openDocument: () => Promise<string | null>
            openLink: (url: string) => void
        }
    }
}

export default function App() {
    const {
        boards, activeBoardId, loading, navigationStack,
        sidebarCollapsed, jumpRef,
        handleSaveBoard, handleNew, handleSwitch, handleSwitchToChild,
        handleSetParent, handleBack, handleRename, handleDelete,
        handleJump, handleSetJournal, handleSetStatus,
        handleRestore, handleGoToWeeklyCard, handleSaveJournal,
        handleMoveCardToBoard, handleCreateBoard,
        handleToggleCollapse, handleGoToInbox, handleReorderBoards,
    } = useBoardManager()

    const [isDark, setIsDark] = useState(() => {
        try { return localStorage.getItem('theme') === 'dark' } catch { return false }
    })
    const [searchOpen, setSearchOpen] = useState(false)
    const [hotkeyOpen, setHotkeyOpen] = useState(false)
    const [overviewOpen, setOverviewOpen] = useState(false)
    const [taskCenterOpen, setTaskCenterOpen] = useState(false)
    const [filterOpen, setFilterOpen] = useState(false)
    const [reviewCenterOpen, setReviewCenterOpen] = useState(false)
    const [backupPanelOpen, setBackupPanelOpen] = useState(false)
    const [movingCardShapeId, setMovingCardShapeId] = useState<string | null>(null)
    const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false)

    const toggleTheme = useCallback(() => {
        setIsDark(prev => {
            const next = !prev
            try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { }
            return next
        })
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }, [isDark])

    const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
    const activeBoard = boards.find(b => b.id === activeBoardId) ?? null

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault()
                setOverviewOpen(prev => !prev)
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
                e.preventDefault()
                setReviewCenterOpen(prev => !prev)
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
                e.preventDefault()
                handleGoToInbox()
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault()
                setKnowledgeGraphOpen(prev => !prev)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleGoToInbox])

    if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>

    return (
        <>
            {activeBoard && (
                <Whiteboard
                    key={activeBoard.id}
                    board={activeBoard}
                    boards={boards}
                    onSaveBoard={handleSaveBoard}
                    jumpRef={jumpRef}
                    onOpenSearch={() => setSearchOpen(true)}
                    onOpenHotkey={() => setHotkeyOpen(true)}
                    onCreateBoard={(name) => handleCreateBoard(name, activeBoardId ?? undefined)}
                    onSwitchBoard={handleSwitchToChild}
                    sidebarWidth={sidebarWidth}
                    isInboxBoard={activeBoardId === INBOX_BOARD_ID}
                    onMoveCard={shapeId => setMovingCardShapeId(shapeId)}
                    isDark={isDark}
                />
            )}

            <BoardTabBar
                boards={boards}
                activeBoardId={activeBoardId ?? ''}
                onSwitch={handleSwitch}
                onNew={handleNew}
                onRename={handleRename}
                onDelete={handleDelete}
                onSearch={() => setSearchOpen(true)}
                onHotkey={() => setHotkeyOpen(true)}
                onOpenOverview={() => setOverviewOpen(true)}
                onSetJournal={handleSetJournal}
                navigationStack={navigationStack}
                onBack={handleBack}
                onSetParent={handleSetParent}
                onSwitchToChild={handleSwitchToChild}
                collapsed={sidebarCollapsed}
                onToggleCollapse={handleToggleCollapse}
                onSetStatus={handleSetStatus}
                onOpenTaskCenter={() => setTaskCenterOpen(true)}
                onOpenFilter={() => setFilterOpen(true)}
                onOpenReviewCenter={() => setReviewCenterOpen(true)}
                onOpenBackup={() => setBackupPanelOpen(true)}
                onGoToInbox={handleGoToInbox}
                onOpenKnowledgeGraph={() => setKnowledgeGraphOpen(true)}
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onReorderBoards={handleReorderBoards}
            />

            {movingCardShapeId && (
                <MoveCardModal
                    boards={boards}
                    onSelect={targetBoardId => { handleMoveCardToBoard(movingCardShapeId, targetBoardId); setMovingCardShapeId(null) }}
                    onClose={() => setMovingCardShapeId(null)}
                    isDark={isDark}
                />
            )}

            {searchOpen && (
                <SearchPanel
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { setSearchOpen(false); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => setSearchOpen(false)}
                    isDark={isDark}
                />
            )}
            {hotkeyOpen && <HotkeyPanel onClose={() => setHotkeyOpen(false)} />}
            {taskCenterOpen && (
                <TaskCenter
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { setTaskCenterOpen(false); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => setTaskCenterOpen(false)}
                    isDark={isDark}
                />
            )}
            {filterOpen && (
                <FilterPanel
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { setFilterOpen(false); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => setFilterOpen(false)}
                    isDark={isDark}
                />
            )}
            {backupPanelOpen && (
                <BackupPanel
                    sidebarWidth={sidebarWidth}
                    onClose={() => setBackupPanelOpen(false)}
                    onRestore={async (restoredBoards) => { await handleRestore(restoredBoards); setBackupPanelOpen(false) }}
                    isDark={isDark}
                />
            )}
            {overviewOpen && (
                <BoardOverview
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSelect={handleSwitch}
                    onNew={handleNew}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onSetStatus={handleSetStatus}
                    onClose={() => setOverviewOpen(false)}
                    isDark={isDark}
                />
            )}
            {reviewCenterOpen && (
                <ReviewCenter
                    boards={boards}
                    onClose={() => setReviewCenterOpen(false)}
                    onJumpToBoard={handleSwitch}
                    onSaveJournal={handleSaveJournal}
                    onGoToWeeklyCard={() => { setReviewCenterOpen(false); handleGoToWeeklyCard() }}
                    isDark={isDark}
                />
            )}
            {knowledgeGraphOpen && (
                <KnowledgeGraph
                    boards={boards}
                    onClose={() => setKnowledgeGraphOpen(false)}
                    onJumpToCard={(boardId, shapeId) => {
                        setKnowledgeGraphOpen(false)
                        handleSwitch(boardId)
                        setTimeout(() => jumpRef.current?.(shapeId, 0, 0), 400)
                    }}
                    onSwitchBoard={boardId => {
                        setKnowledgeGraphOpen(false)
                        handleSwitch(boardId)
                    }}
                />
            )}
        </>
    )
}
