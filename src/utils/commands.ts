// src/utils/commands.ts
//
// 全域 Command Palette（N1）的命令 registry 純函式層。
// 命令清單集中在此（資料驅動），由 App.tsx 提供實際的動作 callback；
// UI（CommandPalette.tsx）只負責過濾、分組與鍵盤導航。
// 目標：把散落在側邊欄/快捷鍵/更多選單的入口統一到一個可搜尋面板，
// 直接改善可發現性（roadmap D1 主頁定位 / D7 任務·復盤中心使用率）。

export type CommandGroup = '前往' | '建立' | '工具' | '資料' | '外觀' | '說明'

export interface Command {
    id: string
    title: string
    icon: string
    group: CommandGroup
    /** 額外搜尋詞（中英別名），讓英文輸入也能命中。 */
    keywords?: string
    /** 顯示用快捷鍵字串（非實際綁定）。 */
    shortcut?: string
    run: () => void
}

/** App.tsx 注入的動作集合；每個命令對應一個具名 callback。 */
export interface CommandActions {
    goHome: () => void
    goToInbox: () => void
    openOverview: () => void
    newBoard: () => void
    quickCapture: () => void
    openSearch: () => void
    openCardLibrary: () => void
    openTaskCenter: () => void
    openReviewCenter: () => void
    openKnowledgeGraph: () => void
    openFilter: () => void
    openTrash: () => void
    openBackup: () => void
    openDataSafety: () => void
    toggleTheme: () => void
    openOnboarding: () => void
    openHotkey: () => void
}

/** 依注入的動作組出完整命令清單（順序即分組內顯示順序）。 */
export function buildCommands(a: CommandActions): Command[] {
    return [
        // 前往
        { id: 'go-home', title: '前往主頁', icon: '🏠', group: '前往', keywords: 'home dashboard 首頁', run: a.goHome },
        { id: 'go-inbox', title: '前往收件匣', icon: '📥', group: '前往', keywords: 'inbox', shortcut: 'Ctrl+Shift+I', run: a.goToInbox },
        { id: 'open-overview', title: '所有白板', icon: '🗂️', group: '前往', keywords: 'overview boards 白板總覽', shortcut: 'Ctrl+Shift+O', run: a.openOverview },
        // 建立
        { id: 'new-board', title: '新增白板', icon: '➕', group: '建立', keywords: 'new board create 建立', run: a.newBoard },
        { id: 'quick-capture', title: '快速捕捉到收件匣', icon: '⚡', group: '建立', keywords: 'capture quick 捕捉 收件匣', shortcut: 'Ctrl+Space', run: a.quickCapture },
        // 工具
        { id: 'open-search', title: '搜尋卡片', icon: '🔍', group: '工具', keywords: 'search find 搜尋', shortcut: 'Ctrl+F', run: a.openSearch },
        { id: 'open-card-library', title: '卡片庫', icon: '🗃️', group: '工具', keywords: 'card library 卡片庫', shortcut: 'Ctrl+Shift+L', run: a.openCardLibrary },
        { id: 'open-task-center', title: '任務中心', icon: '✅', group: '工具', keywords: 'task todo 任務', run: a.openTaskCenter },
        { id: 'open-review-center', title: '復盤中心', icon: '📔', group: '工具', keywords: 'review journal 復盤 週回顧', shortcut: 'Ctrl+Shift+C', run: a.openReviewCenter },
        { id: 'open-knowledge-graph', title: '知識圖譜', icon: '🕸️', group: '工具', keywords: 'graph knowledge 圖譜', shortcut: 'Ctrl+Shift+G', run: a.openKnowledgeGraph },
        { id: 'open-filter', title: '篩選卡片', icon: '🔎', group: '工具', keywords: 'filter 篩選 標籤', run: a.openFilter },
        { id: 'open-trash', title: '垃圾桶', icon: '🗑️', group: '工具', keywords: 'trash 垃圾桶 還原', shortcut: 'Ctrl+Shift+T', run: a.openTrash },
        // 資料
        { id: 'open-backup', title: '自動備份', icon: '🔒', group: '資料', keywords: 'backup 備份 還原', run: a.openBackup },
        { id: 'open-data-safety', title: '資料安全中心', icon: '🛡️', group: '資料', keywords: 'data safety storage 容量 統計', run: a.openDataSafety },
        // 外觀
        { id: 'toggle-theme', title: '切換深色 / 淺色', icon: '🌓', group: '外觀', keywords: 'theme dark light 深色 淺色 主題', run: a.toggleTheme },
        // 說明
        { id: 'open-onboarding', title: '使用導覽', icon: '📖', group: '說明', keywords: 'onboarding guide help 導覽 教學', run: a.openOnboarding },
        { id: 'open-hotkey', title: '快捷鍵一覽', icon: '⌨️', group: '說明', keywords: 'hotkey shortcut 快捷鍵', run: a.openHotkey },
    ]
}

/**
 * 依 query 過濾命令：空 query 回傳全部；否則以空白分詞，
 * 每個 token 都需出現在 title+keywords（AND 語意），支援中英混合。
 */
export function filterCommands<T extends { title: string; keywords?: string }>(commands: T[], query: string): T[] {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    const tokens = q.split(/\s+/)
    return commands.filter(c => {
        const hay = `${c.title} ${c.keywords ?? ''}`.toLowerCase()
        return tokens.every(t => hay.includes(t))
    })
}
