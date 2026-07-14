import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useBoardManager } from './hooks/useBoardManager'
import { usePanelState } from './hooks/usePanelState'
import { Whiteboard } from './components/Whiteboard'
import { BoardTabBar } from './components/BoardTabBar'
import { BoardOverview } from './components/BoardOverview'
import { MoveCardModal } from './components/MoveCardModal'
import { SearchPanel } from './SearchPanel'
import { TaskCenter } from './TaskCenter'
import { FilterPanel } from './FilterPanel'
import { BackupPanel } from './BackupPanel'
import { DataSafetyPanel } from './components/DataSafetyPanel'
import { ReviewCenter } from './ReviewCenter'
import { HotkeyPanel } from './HotkeyPanel'
import { KnowledgeGraph } from './KnowledgeGraph'
import { CardLibrary } from './CardLibrary'
import { QuickCapture } from './components/QuickCapture'
import { QuickSwitcher } from './QuickSwitcher'
import { OnboardingModal } from './components/OnboardingModal'
import { TrashPanel } from './TrashPanel'
import { DeleteBoardDialog } from './components/DeleteBoardDialog'
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, INBOX_BOARD_ID, JUMP_DELAY_MS, Z_MODAL_BACKDROP } from './constants'
import { getCardShapes } from './utils/snapshot'
import { getTodayStr } from './utils/date'
import 'tldraw/tldraw.css'

export default function App() {
    const {
        boards, activeBoardId, loading, navigationStack,
        sidebarCollapsed, jumpRef,
        trashCount, refreshTrashCount,
        handleSaveBoard, handleNew, handleSwitch, handleSwitchToChild,
        handleSetParent, handleBack, handleRename,
        handleSoftDeleteBoardWithInboxMove, handlePermanentDeleteBoard, handleRestoreBoard,
        handleEmptyTrash, handleCardTrashed,
        handleJump, handleSetJournal, handleSetStatus,
        handleRestore, handleGoToWeeklyCard, handleSaveJournal,
        handleMoveCardsToBoard, handleCreateBoard,
        handleToggleCollapse, handleGoToInbox, handleReorderBoards,
        handleAddCardToInbox, recentlyTrashedShapeIds,
        handleCreateFolder, handleSetFolder, handleDeleteFolder,
        migrateAllNow,
    } = useBoardManager()

    const [isDark, setIsDark] = useState(() => {
        try { return localStorage.getItem('theme') === 'dark' } catch { return false }
    })
    const { panels, openPanel, closePanel, togglePanel } = usePanelState()
    const [movingCardShapeIds, setMovingCardShapeIds] = useState<string[] | null>(null)
    const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
    const bannerShownRef = useRef(false)

    const { overdueCount, todayCount } = useMemo(() => {
        const todayStr = getTodayStr()
        let overdue = 0
        let today = 0
        for (const board of boards) {
            for (const shape of getCardShapes(board.snapshot)) {
                if (shape.props.type !== 'todo') continue
                for (const t of shape.props.todos ?? []) {
                    if (t.checked || !t.dueDate) continue
                    if (t.dueDate < todayStr) overdue++
                    else if (t.dueDate === todayStr) today++
                }
            }
        }
        return { overdueCount: overdue, todayCount: today }
    }, [boards])

    useEffect(() => {
        if (loading) return
        try {
            if (localStorage.getItem('onboarding-completed') !== 'true') {
                openPanel('onboarding')
            }
        } catch { /* empty */ }
    }, [loading, openPanel])

    useEffect(() => {
        if (loading || bannerShownRef.current) return
        bannerShownRef.current = true
        if (overdueCount === 0) return
        const t1 = setTimeout(() => openPanel('overdueBanner'), 300)
        const t2 = setTimeout(() => closePanel('overdueBanner'), 5300)
        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [loading, overdueCount, openPanel, closePanel])

    const handleDeleteWithConfirm = useCallback((id: string) => {
        setDeletingBoardId(id)
    }, [])

    const toggleTheme = useCallback(() => {
        setIsDark(prev => {
            const next = !prev
            try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { /* empty */ }
            return next
        })
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }, [isDark])

    const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
    const activeBoard = boards.find(b => b.id === activeBoardId) ?? null

    const activePanel = panels.cardLibrary ? 'cardLibrary'
        : panels.taskCenter ? 'taskCenter'
        : panels.reviewCenter ? 'reviewCenter'
        : panels.knowledgeGraph ? 'knowledgeGraph'
        : null

    const inboxCardCount = useMemo(() => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return 0
        return getCardShapes(inboxBoard.snapshot).length
    }, [boards])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault()
                togglePanel('overview')
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
                e.preventDefault()
                togglePanel('reviewCenter')
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
                e.preventDefault()
                handleGoToInbox()
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault()
                togglePanel('knowledgeGraph')
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
                e.preventDefault()
                togglePanel('cardLibrary')
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ' ') {
                e.preventDefault()
                togglePanel('quickCapture')
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
                e.preventDefault()
                togglePanel('trash')
            }
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
                e.preventDefault()
                openPanel('quickSwitcher')
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleGoToInbox, togglePanel, openPanel])

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
                    onOpenSearch={() => openPanel('search')}
                    onOpenHotkey={() => openPanel('hotkey')}
                    onOpenQuickSwitcher={() => openPanel('quickSwitcher')}
                    onCreateBoard={(name) => handleCreateBoard(name, activeBoardId ?? undefined)}
                    onSwitchBoard={handleSwitchToChild}
                    sidebarWidth={sidebarWidth}
                    isInboxBoard={activeBoardId === INBOX_BOARD_ID}
                    onMoveCard={shapeIds => setMovingCardShapeIds(shapeIds)}
                    isDark={isDark}
                    onOpenTaskCenter={() => openPanel('taskCenter')}
                    onOpenReviewCenter={() => openPanel('reviewCenter')}
                    onOpenKnowledgeGraph={() => openPanel('knowledgeGraph')}
                    onOpenCardLibrary={() => openPanel('cardLibrary')}
                    onOpenOverview={() => openPanel('overview')}
                    onQuickCapture={() => openPanel('quickCapture')}
                    onCardTrashed={handleCardTrashed}
                    recentlyTrashedShapeIds={recentlyTrashedShapeIds}
                />
            )}

            <BoardTabBar
                boards={boards}
                activeBoardId={activeBoardId ?? ''}
                onSwitch={handleSwitch}
                onNew={handleNew}
                onRename={handleRename}
                onDelete={handleDeleteWithConfirm}
                onOpenPanel={openPanel}
                onSetJournal={handleSetJournal}
                navigationStack={navigationStack}
                onBack={handleBack}
                onSetParent={handleSetParent}
                onSwitchToChild={handleSwitchToChild}
                collapsed={sidebarCollapsed}
                onToggleCollapse={handleToggleCollapse}
                onSetStatus={handleSetStatus}
                onGoToInbox={handleGoToInbox}
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onReorderBoards={handleReorderBoards}
                inboxCardCount={inboxCardCount}
                overdueCount={overdueCount}
                todayCount={todayCount}
                activePanel={activePanel}
                trashCount={trashCount}
                onCreateFolder={handleCreateFolder}
                onSetFolder={handleSetFolder}
                onDeleteFolder={handleDeleteFolder}
            />

            {movingCardShapeIds && (
                <MoveCardModal
                    boards={boards}
                    excludeBoardId={activeBoardId ?? undefined}
                    onSelect={targetBoardId => { handleMoveCardsToBoard(movingCardShapeIds, targetBoardId, activeBoardId ?? undefined); setMovingCardShapeIds(null) }}
                    onClose={() => setMovingCardShapeIds(null)}
                    isDark={isDark}
                />
            )}

            {panels.search && (
                <SearchPanel
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('search'); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('search')}
                    isDark={isDark}
                />
            )}
            {panels.hotkey && <HotkeyPanel onClose={() => closePanel('hotkey')} />}
            {panels.taskCenter && (
                <TaskCenter
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('taskCenter'); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('taskCenter')}
                    isDark={isDark}
                />
            )}
            {panels.filter && (
                <FilterPanel
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('filter'); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('filter')}
                    isDark={isDark}
                />
            )}
            {panels.backup && (
                <BackupPanel
                    sidebarWidth={sidebarWidth}
                    onClose={() => closePanel('backup')}
                    onRestore={async (restoredBoards) => { await handleRestore(restoredBoards); closePanel('backup') }}
                    onMigrateImages={migrateAllNow}
                    isDark={isDark}
                />
            )}
            {panels.dataSafety && (
                <DataSafetyPanel
                    boards={boards}
                    onClose={() => closePanel('dataSafety')}
                    onOpenBackup={() => { closePanel('dataSafety'); openPanel('backup') }}
                    isDark={isDark}
                />
            )}
            {panels.overview && (
                <BoardOverview
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSelect={handleSwitch}
                    onNew={handleNew}
                    onRename={handleRename}
                    onDelete={handleDeleteWithConfirm}
                    onSetStatus={handleSetStatus}
                    onClose={() => closePanel('overview')}
                    isDark={isDark}
                />
            )}
            {panels.reviewCenter && (
                <ReviewCenter
                    boards={boards}
                    onClose={() => closePanel('reviewCenter')}
                    onJumpToBoard={handleSwitch}
                    onSaveJournal={handleSaveJournal}
                    onGoToWeeklyCard={() => { closePanel('reviewCenter'); handleGoToWeeklyCard() }}
                    isDark={isDark}
                />
            )}
            {panels.knowledgeGraph && (
                <KnowledgeGraph
                    boards={boards}
                    onClose={() => closePanel('knowledgeGraph')}
                    onJumpToCard={(boardId, shapeId) => {
                        closePanel('knowledgeGraph')
                        handleSwitch(boardId)
                        setTimeout(() => jumpRef.current?.(shapeId, 0, 0), JUMP_DELAY_MS)
                    }}
                    onSwitchBoard={boardId => {
                        closePanel('knowledgeGraph')
                        handleSwitch(boardId)
                    }}
                />
            )}
            {panels.cardLibrary && (
                <CardLibrary
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('cardLibrary'); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('cardLibrary')}
                    isDark={isDark}
                />
            )}
            {panels.quickCapture && (
                <QuickCapture
                    onSave={text => { handleAddCardToInbox(text); closePanel('quickCapture') }}
                    onClose={() => closePanel('quickCapture')}
                    isDark={isDark}
                />
            )}
            {panels.onboarding && (
                <OnboardingModal
                    onClose={() => closePanel('onboarding')}
                    isDark={isDark}
                />
            )}
            {deletingBoardId && (() => {
                const board = boards.find(b => b.id === deletingBoardId)
                if (!board) return null
                const hasInbox = boards.some(b => b.isInbox)
                return (
                    <DeleteBoardDialog
                        board={board}
                        hasInbox={hasInbox}
                        onConfirm={(moveToInbox) => {
                            handleSoftDeleteBoardWithInboxMove(deletingBoardId, moveToInbox)
                            setDeletingBoardId(null)
                        }}
                        onCancel={() => setDeletingBoardId(null)}
                        isDark={isDark}
                    />
                )
            })()}
            {panels.quickSwitcher && (
                <QuickSwitcher
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSwitch={handleSwitch}
                    onClose={() => closePanel('quickSwitcher')}
                    isDark={isDark}
                />
            )}
            {panels.trash && (
                <TrashPanel
                    onClose={() => closePanel('trash')}
                    onRestoreBoard={handleRestoreBoard}
                    onPermanentDeleteBoard={handlePermanentDeleteBoard}
                    onEmptyTrash={handleEmptyTrash}
                    onCardRestored={() => { refreshTrashCount() }}
                    isDark={isDark}
                />
            )}
            {panels.overdueBanner && (
                <div style={{
                    position: 'fixed', bottom: 24, left: 24, zIndex: Z_MODAL_BACKDROP,
                    background: isDark ? '#1e293b' : 'white',
                    border: `1px solid ${isDark ? '#475569' : '#fecaca'}`,
                    borderRadius: 14, padding: '14px 18px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    width: 270,
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#fca5a5' : '#dc2626' }}>
                        ⚠️ 你有 {overdueCount} 個逾期任務
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => { closePanel('overdueBanner'); openPanel('taskCenter') }}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >查看任務中心</button>
                        <button
                            onClick={() => closePanel('overdueBanner')}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`, background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: 12 }}
                        >稍後再說</button>
                    </div>
                </div>
            )}
        </>
    )
}
