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
        'create-board-card-on': CustomEvent<{ targetBoardId: string; linkedBoardId: string; boardName: string }>
        'jump-to-card': CustomEvent<{ boardId?: string; shapeId?: string; x?: number; y?: number; targetName?: string }>
        'quick-capture-card': CustomEvent<{ text: string; x: number; y: number; shapeId: string }>
        'delete-shape-from-editor': CustomEvent<{ shapeId: string }>
        'update-shape-props-in-editor': CustomEvent<{ shapeId: string; props: Record<string, unknown> }>
    }
}
