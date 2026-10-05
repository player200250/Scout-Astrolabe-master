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
}

declare global {
    interface Window {
        electronAPI?: IElectronAPI
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
