import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
    const [movingCardShapeIds, setMovingCardShapeIds] = useState<string[] | null>(null)
    const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false)
    const [cardLibraryOpen, setCardLibraryOpen] = useState(false)
    const [quickCaptureOpen, setQuickCaptureOpen] = useState(false)
    const [onboardingOpen, setOnboardingOpen] = useState(false)
    const [trashOpen, setTrashOpen] = useState(false)
    const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
    const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
    const [overdueBannerVisible, setOverdueBannerVisible] = useState(false)
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
                setOnboardingOpen(true)
            }
        } catch { /* empty */ }
    }, [loading])

    useEffect(() => {
        if (loading || bannerShownRef.current) return
        bannerShownRef.current = true
        if (overdueCount === 0) return
        const t1 = setTimeout(() => setOverdueBannerVisible(true), 300)
        const t2 = setTimeout(() => setOverdueBannerVisible(false), 5300)
        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [loading, overdueCount])

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

    const activePanel = cardLibraryOpen ? 'cardLibrary'
        : taskCenterOpen ? 'taskCenter'
        : reviewCenterOpen ? 'reviewCenter'
        : knowledgeGraphOpen ? 'knowledgeGraph'
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
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
                e.preventDefault()
                setCardLibraryOpen(prev => !prev)
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ' ') {
                e.preventDefault()
                setQuickCaptureOpen(prev => !prev)
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
                e.preventDefault()
                setTrashOpen(prev => !prev)
            }
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
                e.preventDefault()
                setQuickSwitcherOpen(true)
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
                    onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
                    onCreateBoard={(name) => handleCreateBoard(name, activeBoardId ?? undefined)}
                    onSwitchBoard={handleSwitchToChild}
                    sidebarWidth={sidebarWidth}
                    isInboxBoard={activeBoardId === INBOX_BOARD_ID}
                    onMoveCard={shapeIds => setMovingCardShapeIds(shapeIds)}
                    isDark={isDark}
                    onOpenTaskCenter={() => setTaskCenterOpen(true)}
                    onOpenReviewCenter={() => setReviewCenterOpen(true)}
                    onOpenKnowledgeGraph={() => setKnowledgeGraphOpen(true)}
                    onOpenCardLibrary={() => setCardLibraryOpen(true)}
                    onOpenOverview={() => setOverviewOpen(true)}
                    onQuickCapture={() => setQuickCaptureOpen(true)}
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
                onOpenCardLibrary={() => setCardLibraryOpen(true)}
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onReorderBoards={handleReorderBoards}
                inboxCardCount={inboxCardCount}
                onQuickCapture={() => setQuickCaptureOpen(true)}
                overdueCount={overdueCount}
                todayCount={todayCount}
                onOpenOnboarding={() => setOnboardingOpen(true)}
                activePanel={activePanel}
                trashCount={trashCount}
                onOpenTrash={() => setTrashOpen(true)}
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
                    onDelete={handleDeleteWithConfirm}
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
                        setTimeout(() => jumpRef.current?.(shapeId, 0, 0), JUMP_DELAY_MS)
                    }}
                    onSwitchBoard={boardId => {
                        setKnowledgeGraphOpen(false)
                        handleSwitch(boardId)
                    }}
                />
            )}
            {cardLibraryOpen && (
                <CardLibrary
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { setCardLibraryOpen(false); handleJump(boardId, shapeId, x, y) }}
                    onClose={() => setCardLibraryOpen(false)}
                    isDark={isDark}
                />
            )}
            {quickCaptureOpen && (
                <QuickCapture
                    onSave={text => { handleAddCardToInbox(text); setQuickCaptureOpen(false) }}
                    onClose={() => setQuickCaptureOpen(false)}
                    isDark={isDark}
                />
            )}
            {onboardingOpen && (
                <OnboardingModal
                    onClose={() => setOnboardingOpen(false)}
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
            {quickSwitcherOpen && (
                <QuickSwitcher
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSwitch={handleSwitch}
                    onClose={() => setQuickSwitcherOpen(false)}
                    isDark={isDark}
                />
            )}
            {trashOpen && (
                <TrashPanel
                    onClose={() => setTrashOpen(false)}
                    onRestoreBoard={handleRestoreBoard}
                    onPermanentDeleteBoard={handlePermanentDeleteBoard}
                    onEmptyTrash={handleEmptyTrash}
                    onCardRestored={() => { refreshTrashCount() }}
                    isDark={isDark}
                />
            )}
            {overdueBannerVisible && (
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
                            onClick={() => { setOverdueBannerVisible(false); setTaskCenterOpen(true) }}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >查看任務中心</button>
                        <button
                            onClick={() => setOverdueBannerVisible(false)}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`, background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: 12 }}
                        >稍後再說</button>
                    </div>
                </div>
            )}
        </>
    )
}
