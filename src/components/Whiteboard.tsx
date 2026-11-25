import React, { useEffect, useMemo } from 'react'
import { Tldraw, SelectTool, defaultTools, useEditor } from 'tldraw'
import type { TLEditorSnapshot } from 'tldraw'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import type { BoardRecord } from '../db'
import { CardShapeUtil, BoardsContext, BacklinksContext } from './card-shape/CardShapeUtil'
import { CustomFrameShapeUtil } from './CustomFrameShapeUtil'
import { useBacklinks } from '../hooks/useBacklinks'
import { WhiteboardTools } from './WhiteboardTools'
import { Dashboard } from './Dashboard'
import { ErrorBoundary } from './ErrorBoundary'
import { useIsDark } from '../theme/ThemeContext'

// tldraw 預設從 cdn.tldraw.com 抓字型、圖示、翻譯檔（v1.8.4 測試報告 P1-1）：
// 斷網又沒有快取時，翻譯檔抓不到變成 unhandledrejection，整個 App 被錯誤畫面蓋掉。
// 改成打包進 App（@tldraw/assets 版本要跟 tldraw 一致，package.json 已釘死）。
// 例外是翻譯檔：tldraw 用 fetch() 讀它，而 Electron 的 fetch 不支援 file://（實測照樣 Failed to fetch）。
// 我們 hideUi、用不到 tldraw 的介面文字，給空的 data: URL，讓它退回內建英文。
// 傳 identity：base './' 下匯入的網址已是完整 file:///…，預設格式化會在前面再加一個 / 變成 file:///C:/file:///…
const BUNDLED_ASSET_URLS = getAssetUrlsByImport(url => url)
const EMPTY_TRANSLATION = 'data:application/json,{}'
const TLDRAW_ASSET_URLS = {
    ...BUNDLED_ASSET_URLS,
    translations: Object.fromEntries(Object.keys(BUNDLED_ASSET_URLS.translations).map(k => [k, EMPTY_TRANSLATION])),
}

class CustomSelectTool extends SelectTool {
    static id = 'select' as const
    override onDoubleClick() { return }
}

const customTools = defaultTools.map(tool =>
    tool.id === 'select' ? CustomSelectTool : tool
)

function ThemeSync() {
    const isDark = useIsDark()
    const editor = useEditor()
    useEffect(() => {
        editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' })
    }, [editor, isDark])
    return null
}

interface WhiteboardProps {
    board: BoardRecord
    boards: BoardRecord[]
    onSaveBoard: (snapshot: TLEditorSnapshot, thumbnail: string | null | undefined, boardId: string) => void
    jumpRef: React.MutableRefObject<((shapeId: string, x: number, y: number) => void) | null>
    onOpenSearch: () => void
    onOpenHotkey: () => void
    onOpenQuickSwitcher?: () => void
    onCreateBoard: (name: string) => BoardRecord
    onSwitchBoard: (id: string) => void
    sidebarWidth: number
    isInboxBoard: boolean
    onMoveCard: (shapeIds: string[]) => void
    onOpenTaskCenter: () => void
    onOpenTodayJournal: () => void
    onOpenOverview: () => void
    onQuickCapture: () => void
    onCardTrashed?: () => void
    recentlyTrashedShapeIds: React.MutableRefObject<Set<string>>
}

export function Whiteboard({
    board, boards, onSaveBoard, jumpRef, onOpenSearch, onOpenHotkey, onOpenQuickSwitcher,
    onCreateBoard, onSwitchBoard, sidebarWidth, isInboxBoard, onMoveCard, 
    onOpenTaskCenter, onOpenTodayJournal,
    onOpenOverview, onQuickCapture, onCardTrashed,
    recentlyTrashedShapeIds,
}: WhiteboardProps) {
    const boardInfos = boards.map(b => ({ id: b.id, name: b.name, thumbnail: b.thumbnail }))
    const { forwardLinks, backlinks, cardIndex } = useBacklinks(boards)
    const backlinksValue = useMemo(() => ({
        forwardLinks,
        backlinks,
        boardNames: boards.filter(b => !b.isHome).map(b => b.name),
        cardIndex,
        currentBoardName: board.name,
    }), [forwardLinks, backlinks, cardIndex, boards, board.name])

    // D1：主頁永遠是儀表板，不再有儀表板／白板雙模式（舊主頁畫布內容由 loadAllBoards 搬成普通白板）
    if (board.isHome) {
        return (
            <Dashboard
                boards={boards}
                onSwitch={onSwitchBoard}
                onOpenTaskCenter={onOpenTaskCenter}
                onOpenTodayJournal={onOpenTodayJournal}
                onOpenOverview={onOpenOverview}
                onQuickCapture={onQuickCapture}
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
                        <Tldraw hideUi={true} assetUrls={TLDRAW_ASSET_URLS} tools={customTools} shapeUtils={[CardShapeUtil, CustomFrameShapeUtil]}>
                            <ThemeSync />
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
