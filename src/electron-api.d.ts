// src/electron-api.d.ts
import type { TLEditorSnapshot } from 'tldraw'

export interface LoadDocumentResult {
    snapshot: TLEditorSnapshot | null
}

interface LinkPreviewResult {
    title?: string
    description?: string
    image?: string | null
}

export interface IElectronAPI {
    saveDocument: (document: string) => void
    loadDocument: () => Promise<LoadDocumentResult | null>
    openDocument: () => Promise<string | null>
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
