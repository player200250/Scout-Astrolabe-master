import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useBoardManager } from './hooks/useBoardManager'
import { usePanelState } from './hooks/usePanelState'
import { useTheme } from './hooks/useTheme'
import { useOverdueStats } from './hooks/useOverdueStats'
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys'
import { usePomodoro } from './hooks/usePomodoro'
import { PomodoroPanel } from './components/PomodoroPanel'
import { formatRemaining } from './utils/pomodoro'
import { ThemeProvider } from './theme/ThemeContext'
import { CloudSyncPanel } from './components/CloudSyncPanel'
import { ToastHost } from './components/ui/ToastHost'
import { PromptHost } from './components/ui/PromptHost'
import { onTriggerQuickCapture } from './platform/quickCapture'
import { useDesktopBridge } from './hooks/useDesktopBridge'
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
import type { ReviewTab } from './ReviewCenter'
import { HotkeyPanel } from './HotkeyPanel'
import { KnowledgeGraph } from './KnowledgeGraph'
import { CardLibrary } from './CardLibrary'
import { QuickCapture } from './components/QuickCapture'
import { InboxTriage } from './components/InboxTriage'
import { TagManager } from './components/TagManager'
import { QuickSwitcher } from './QuickSwitcher'
import { CommandPalette } from './CommandPalette'
import { buildCommands } from './utils/commands'
import { OnboardingModal } from './components/OnboardingModal'
import { TrashPanel } from './TrashPanel'
import { DeleteBoardDialog } from './components/DeleteBoardDialog'
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, INBOX_BOARD_ID, JUMP_DELAY_MS, Z_MODAL_BACKDROP } from './constants'
import { getCardShapes } from './utils/snapshot'
import { reviewTargetFor } from './utils/journalCards'
import type { ReviewTarget } from './utils/journalCards'
import { onAppEvent } from './utils/appEvents'
import 'tldraw/tldraw.css'
import { T } from './theme/tokens'

export default function App() {
    const {
        boards, activeBoardId, loading, navigationStack,
        sidebarCollapsed, jumpRef,
        trashCount, refreshTrashCount,
        handleSaveBoard, handleNew, handleCreateBoardFromTemplate, handleSwitch, handleSwitchToChild,
        handleBack, handleRename,
        handleSoftDeleteBoardsWithInboxMove, handlePermanentDeleteBoard, handleRestoreBoard,
        handleEmptyTrash, handleCardTrashed,
        handleJump, handleSetJournal, handleSetStatus,
        handleRestore, handleSaveJournal,
        handleMoveCardsToBoard, handleCreateBoard,
        handleToggleCollapse, handleGoToInbox, handleReorderBoards,
        handleAddCardToInbox, handleUpdateInboxCardProps, handleTrashInboxCard,
        recentlyTrashedShapeIds,
        handleCreateFolder, handleSetFolder, handleDeleteFolder,
        handleRewriteTag,
        migrateAllNow,
    } = useBoardManager()

    const { isDark, toggleTheme } = useTheme()
    const { panels, openPanel, closePanel, togglePanel } = usePanelState()
    // ⚠️ 掛在這裡而不是面板裡：面板關掉計時器必須繼續跑。
    const pomodoro = usePomodoro()
    const [movingCardShapeIds, setMovingCardShapeIds] = useState<string[] | null>(null)
    // 陣列而非單一 id：批次刪除（多選、清理重複）要一次確認全部。
    // 舊版是 string | null，呼叫端跑 forEach 只會留下最後一個 → 其餘靜默不刪。
    const [deletingBoardIds, setDeletingBoardIds] = useState<string[]>([])
    // 復盤中心開在哪一頁。從側邊欄／快捷鍵／命令面板進去是月曆，
    // 只有儀表板的「開啟今日日記 →」會指定日記頁。
    const [reviewTab, setReviewTab] = useState<ReviewTab>('calendar')
    // 日記頁／週回顧開在哪一天（RC17）。key 每次指定目的地就換：面板已開著時
    // （例：日記編輯器裡點了另一天的 [[連結]]）也要重新掛載，初始日期才會生效。
    const [reviewDate, setReviewDate] = useState<Date | undefined>(undefined)
    const [reviewKey, setReviewKey] = useState(0)
    const bannerShownRef = useRef(false)

    const { overdueCount, todayCount } = useOverdueStats(boards)

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

    // 面板一關就把分頁還原成月曆。放在「關閉」而非各個開啟點，是因為開啟點有四個
    // （側邊欄／Ctrl+Shift+C／命令面板／儀表板按鈕），其中側邊欄那個直接呼叫 usePanelState
    // 的 openPanel、碰不到這裡的 state；關閉路徑則一律會讓 panels.reviewCenter 變 false。
    useEffect(() => {
        if (!panels.reviewCenter) { setReviewTab('calendar'); setReviewDate(undefined) }
    }, [panels.reviewCenter])

    const openReviewAt = useCallback((t: ReviewTarget) => {
        setReviewTab(t.tab)
        setReviewDate(t.tab === 'calendar' ? undefined : t.date)
        setReviewKey(k => k + 1)
        openPanel('reviewCenter')
    }, [openPanel])

    // RC17 方案 D：日誌板只當倉庫、不該被切進去。凡是「跳到卡片」的目的地在日誌板，
    // 一律改開復盤中心並落在那張卡的日期。`[[連結]]`／反向連結走事件（見 WhiteboardTools）。
    const jumpToCard = useCallback((boardId: string, shapeId: string, x: number, y: number) => {
        const t = reviewTargetFor(boards, boardId, shapeId)
        if (t) openReviewAt(t)
        else handleJump(boardId, shapeId, x, y)
    }, [boards, openReviewAt, handleJump])

    useEffect(() => onAppEvent('open-review-center', openReviewAt), [openReviewAt])

    const handleDeleteWithConfirm = useCallback((id: string) => {
        setDeletingBoardIds([id])
    }, [])

    const handleDeleteManyWithConfirm = useCallback((ids: string[]) => {
        if (ids.length > 0) setDeletingBoardIds(ids)
    }, [])

    const goHome = useCallback(() => {
        const home = boards.find(b => b.isHome)
        if (home) handleSwitch(home.id)
    }, [boards, handleSwitch])

    const { desktopOpen, toggleDesktop } = useDesktopBridge(boards, loading, {
        onOpenBoard: handleSwitch,
        onOpenTaskCenter: () => openPanel('taskCenter'),
        onOpenJournal: () => openReviewAt({ tab: 'journal', date: new Date() }),
        onQuickCapture: handleAddCardToInbox,
    })

    // Command Palette（N1）命令清單：把散落各處的入口統一為可搜尋動作。
    const commands = useMemo(() => buildCommands({
        goHome,
        goToInbox: handleGoToInbox,
        openOverview: () => openPanel('overview'),
        newBoard: handleNew,
        quickCapture: () => openPanel('quickCapture'),
        openInboxTriage: () => openPanel('inboxTriage'),
        openSearch: () => openPanel('search'),
        openCardLibrary: () => openPanel('cardLibrary'),
        openTaskCenter: () => openPanel('taskCenter'),
        openReviewCenter: () => openPanel('reviewCenter'),
        openKnowledgeGraph: () => openPanel('knowledgeGraph'),
        openPomodoro: () => openPanel('pomodoro'),
        openFilter: () => openPanel('filter'),
        openTagManager: () => openPanel('tagManager'),
        openTrash: () => openPanel('trash'),
        openBackup: () => openPanel('backup'),
        openDataSafety: () => openPanel('dataSafety'),
        toggleTheme,
        openOnboarding: () => openPanel('onboarding'),
        openHotkey: () => openPanel('hotkey'),
        toggleDesktop,
    }), [goHome, handleGoToInbox, handleNew, openPanel, toggleTheme, toggleDesktop])

    // N3：托盤選單／全域快捷鍵（Ctrl+Shift+Space）觸發快速捕捉。
    // 非 Electron（PWA）環境沒有 electronAPI，optional chaining 直接跳過。
    useEffect(() => {
        return onTriggerQuickCapture(() => openPanel('quickCapture'))
    }, [openPanel])

    const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
    const activeBoard = boards.find(b => b.id === activeBoardId) ?? null

    const activePanel = panels.cardLibrary ? 'cardLibrary'
        : panels.taskCenter ? 'taskCenter'
        : panels.reviewCenter ? 'reviewCenter'
        : panels.knowledgeGraph ? 'knowledgeGraph'
        : panels.pomodoro ? 'pomodoro'
        : null

    const inboxCardCount = useMemo(() => {
        const inboxBoard = boards.find(b => b.isInbox)
        if (!inboxBoard?.snapshot) return 0
        return getCardShapes(inboxBoard.snapshot).length
    }, [boards])

    useGlobalHotkeys({ openPanel, togglePanel, goToInbox: handleGoToInbox })

    if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>

    return (
        <ThemeProvider value={isDark}>
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
                    onCreateBoard={(name) => handleCreateBoard(name)}
                    onSwitchBoard={handleSwitchToChild}
                    sidebarWidth={sidebarWidth}
                    isInboxBoard={activeBoardId === INBOX_BOARD_ID}
                    onMoveCard={shapeIds => setMovingCardShapeIds(shapeIds)}
                    onOpenTaskCenter={() => openPanel('taskCenter')}
                    onOpenTodayJournal={() => { setReviewTab('journal'); openPanel('reviewCenter') }}
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
                collapsed={sidebarCollapsed}
                onToggleCollapse={handleToggleCollapse}
                onSetStatus={handleSetStatus}
                onGoToInbox={handleGoToInbox}
                onToggleTheme={toggleTheme}
                onReorderBoards={handleReorderBoards}
                inboxCardCount={inboxCardCount}
                overdueCount={overdueCount}
                todayCount={todayCount}
                pomodoroNote={pomodoro.running ? formatRemaining(pomodoro.remaining) : null}
                desktopOpen={desktopOpen}
                onToggleDesktop={toggleDesktop}
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
                />
            )}

            {panels.search && (
                <SearchPanel
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('search'); jumpToCard(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('search')}
                />
            )}
            {panels.hotkey && <HotkeyPanel onClose={() => closePanel('hotkey')} />}
            {panels.pomodoro && <PomodoroPanel {...pomodoro} onClose={() => closePanel('pomodoro')} />}
            {panels.taskCenter && (
                <TaskCenter
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('taskCenter'); jumpToCard(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('taskCenter')}
                />
            )}
            {panels.filter && (
                <FilterPanel
                    boards={boards}
                    onJump={(boardId, shapeId, x, y) => { closePanel('filter'); jumpToCard(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('filter')}
                />
            )}
            {panels.tagManager && (
                <TagManager
                    boards={boards}
                    onRewriteTag={handleRewriteTag}
                    onClose={() => closePanel('tagManager')}
                />
            )}
            {panels.backup && (
                <BackupPanel
                    sidebarWidth={sidebarWidth}
                    onClose={() => closePanel('backup')}
                    onRestore={async (restoredBoards) => { await handleRestore(restoredBoards); closePanel('backup') }}
                    onMigrateImages={migrateAllNow}
                />
            )}
            {panels.dataSafety && (
                <DataSafetyPanel
                    boards={boards}
                    onClose={() => closePanel('dataSafety')}
                    onOpenBackup={() => { closePanel('dataSafety'); openPanel('backup') }}
                    onRestore={async (restoredBoards) => { await handleRestore(restoredBoards); closePanel('dataSafety') }}
                />
            )}
            {panels.overview && (
                <BoardOverview
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSelect={handleSwitch}
                    onNew={handleNew}
                    onCreateFromTemplate={(t) => { handleCreateBoardFromTemplate(t); closePanel('overview') }}
                    onRename={handleRename}
                    onDelete={handleDeleteWithConfirm}
                    onDeleteMany={handleDeleteManyWithConfirm}
                    onSetStatus={handleSetStatus}
                    onClose={() => closePanel('overview')}
                />
            )}
            {panels.reviewCenter && (
                <ReviewCenter
                    key={reviewKey}
                    boards={boards}
                    initialTab={reviewTab}
                    initialDate={reviewDate}
                    onClose={() => closePanel('reviewCenter')}
                    onJumpToBoard={handleSwitch}
                    onSaveJournal={handleSaveJournal}
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
                    onJump={(boardId, shapeId, x, y) => { closePanel('cardLibrary'); jumpToCard(boardId, shapeId, x, y) }}
                    onClose={() => closePanel('cardLibrary')}
                />
            )}
            {panels.quickCapture && (
                <QuickCapture
                    onSave={text => { handleAddCardToInbox(text); closePanel('quickCapture') }}
                    onClose={() => closePanel('quickCapture')}
                />
            )}
            {panels.inboxTriage && (
                <InboxTriage
                    boards={boards}
                    onMoveCard={(shapeId, targetBoardId) => handleMoveCardsToBoard([shapeId], targetBoardId)}
                    onUpdateCardProps={handleUpdateInboxCardProps}
                    onTrashCard={handleTrashInboxCard}
                    onClose={() => closePanel('inboxTriage')}
                />
            )}
            {panels.onboarding && (
                <OnboardingModal
                    onClose={() => closePanel('onboarding')}
                />
            )}
            {deletingBoardIds.length > 0 && (() => {
                const targets = deletingBoardIds
                    .map(id => boards.find(b => b.id === id))
                    .filter((b): b is typeof boards[number] => !!b)
                if (targets.length === 0) return null
                const hasInbox = boards.some(b => b.isInbox)
                return (
                    <DeleteBoardDialog
                        boards={targets}
                        hasInbox={hasInbox}
                        onConfirm={(moveToInbox) => {
                            handleSoftDeleteBoardsWithInboxMove(targets.map(b => b.id), moveToInbox)
                            setDeletingBoardIds([])
                        }}
                        onCancel={() => setDeletingBoardIds([])}
                    />
                )
            })()}
            {panels.quickSwitcher && (
                <QuickSwitcher
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSwitch={handleSwitch}
                    onClose={() => closePanel('quickSwitcher')}
                />
            )}
            {panels.commandPalette && (
                <CommandPalette
                    commands={commands}
                    boards={boards}
                    activeBoardId={activeBoardId ?? ''}
                    onSwitchBoard={handleSwitch}
                    onClose={() => closePanel('commandPalette')}
                />
            )}
            {panels.trash && (
                <TrashPanel
                    onClose={() => closePanel('trash')}
                    onRestoreBoard={handleRestoreBoard}
                    onPermanentDeleteBoard={handlePermanentDeleteBoard}
                    onEmptyTrash={handleEmptyTrash}
                    onCardRestored={() => { refreshTrashCount() }}
                />
            )}
            {panels.overdueBanner && (
                <div style={{
                    position: 'fixed', bottom: 24, left: 24, zIndex: Z_MODAL_BACKDROP,
                    background: T.bgPanel,
                    border: `1px solid ${T.dangerBorder}`,
                    borderRadius: 14, padding: '14px 18px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    width: 270,
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.danger }}>
                        ⚠️ 你有 {overdueCount} 個逾期任務
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => { closePanel('overdueBanner'); openPanel('taskCenter') }}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >查看任務中心</button>
                        <button
                            onClick={() => closePanel('overdueBanner')}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: `1px solid ${T.borderLight}`, background: 'transparent', color: T.textSecondary, cursor: 'pointer', fontSize: 12 }}
                        >稍後再說</button>
                    </div>
                </div>
            )}

            {panels.cloudSync && (
                <CloudSyncPanel
                    boards={boards}
                    activeBoardId={activeBoardId}
                    onClose={() => closePanel('cloudSync')}
                />
            )}

            {/* TD9：全域 UI primitive 的渲染端。掛一次即可，任何地方都能用
                showToast() / promptName() 觸發（含 utils、hooks 等非元件的程式碼）。 */}
            <ToastHost />
            <PromptHost />
        </ThemeProvider>
    )
}
