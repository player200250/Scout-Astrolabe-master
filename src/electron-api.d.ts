// src/electron-api.d.ts
interface LinkPreviewResult {
    title?: string
    description?: string
    image?: string | null
}

export interface IElectronAPI {
    openLink: (url: string) => void
    openExternal: (url: string) => void
    getLinkPreview?: (url: string) => Promise<LinkPreviewResult | null>
    selectAndCopyFile: () => Promise<{
        storedName: string
        originalName: string
        size: number
        ext: string
    } | null>
    openFile: (storedName: string) => Promise<void>
    /** 用系統預設看圖程式開圖片卡的實體檔；不是圖片或找不到回 false */
    openImage?: (storedName: string) => Promise<boolean>
    /** 舊版 base64 圖片：寫暫存檔後用看圖程式開 */
    openImageBytes?: (bytes: ArrayBuffer, ext: string) => Promise<boolean>
    deleteFile: (storedName: string) => Promise<void>
    saveImage: (bytes: ArrayBuffer, ext: string) => Promise<{ storedName: string }>
    /** 圖片同步（Supabase Storage）用的三個接縫；舊版 preload 沒有，故為選填。 */
    hasStoredFile?: (storedName: string) => Promise<boolean>
    readStoredFile?: (storedName: string) => Promise<ArrayBuffer | null>
    /** ⚠️ 與 saveImage 不同：沿用呼叫端指定的 storedName，不另產 uuid。 */
    writeStoredFile?: (storedName: string, bytes: ArrayBuffer) => Promise<boolean>
    /** N10：列出 userData/files/ 內的實體檔 metadata（不含內容）。舊版 preload 沒有，故為選填。 */
    listStoredFiles?: () => Promise<{ name: string; size: number; mtimeMs: number }[]>
    /** 硬碟備份（文件\Scout Astrolabe 備份）；節流／空間檢查／保留規則都在主程序。舊版 preload 沒有，故為選填。 */
    writeBackupFile?: (json: string, imageNames: string[]) => Promise<{ written: boolean; reason?: string; name?: string; imagesCopied?: number; deleted?: number }>
    getBackupDir?: () => Promise<string>
    openBackupDir?: () => Promise<string>
    getBackupStatus?: () => Promise<{ dir: string; count: number; totalBytes: number; latest: number | null }>
    /** 選備份檔並回傳內容；會順便把備份裡、本機缺少的圖片補回來（只新增、不覆蓋）。取消回 null */
    pickBackupFile?: () => Promise<{ name: string; json: string; imagesRestored: number } | null>
    /** N3：托盤選單／全域快捷鍵觸發快速捕捉；回傳 unsubscribe */
    onTriggerQuickCapture?: (callback: () => void) => () => void
    /** Scout Desktop：主視窗把摘要交給 main process 轉送；舊版 preload 沒有，故為選填 */
    publishDesktopSummary?: (summary: import('./utils/desktopSummary').DesktopSummary) => void
    /** Scout Desktop 轉來的指令；回傳 unsubscribe */
    onDesktopCommand?: (callback: (cmd: import('./utils/desktopSummary').DesktopCommand) => void) => () => void
    /** 開／關 Scout Desktop，回傳之後是否開著 */
    toggleDesktop?: () => Promise<boolean>
    isDesktopOpen?: () => Promise<boolean>
    /** Desktop 開關狀態改變（含從托盤、快捷鍵、Desktop 自己的 ✕）；回傳 unsubscribe */
    onDesktopOpenChanged?: (callback: (open: boolean) => void) => () => void
}

/** Scout Desktop 視窗專用（preload-desktop.js）；主視窗沒有這個物件 */
export interface IDesktopAPI {
    getSummary: () => Promise<import('./utils/desktopSummary').DesktopSummary | null>
    onSummaryChanged: (callback: (summary: import('./utils/desktopSummary').DesktopSummary | null) => void) => () => void
    sendCommand: (cmd: import('./utils/desktopSummary').DesktopCommand) => Promise<import('./utils/desktopSummary').DesktopCommandResult>
    /** 最新一份硬碟備份的時間（ms）；latest＝null 表示還沒有備份 */
    getBackupStatus: () => Promise<{ latest: number | null } | null>
    /** main 寫完一份硬碟備份；回傳 unsubscribe */
    onBackupChanged: (callback: (latest: number | null) => void) => () => void
    /** 卡片排列；沒存過回 null。存的格式由 main 再檢查一次，不合格回 false */
    getLayout: () => Promise<unknown>
    setLayout: (layout: import('./utils/desktopLayout').DesktopLayout) => Promise<boolean>
}

declare global {
    interface Window {
        electronAPI?: IElectronAPI
        desktopAPI?: IDesktopAPI
        tldrawEditor: import('tldraw').Editor
    }

    interface WindowEventMap {
        'board-card-enter': CustomEvent<{ linkedBoardId: string }>
        'cleanup-orphan-board-cards': CustomEvent<{ deletedBoardId: string }>
        'jump-to-card': CustomEvent<{ boardId?: string; shapeId?: string; x?: number; y?: number; targetName?: string }>
        'quick-capture-card': CustomEvent<{ text: string; x: number; y: number; shapeId: string }>
        'delete-shape-from-editor': CustomEvent<{ shapeId: string }>
        'update-shape-props-in-editor': CustomEvent<{ shapeId: string; props: Record<string, unknown> }>
    }
}
