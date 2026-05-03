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
    getLinkPreview?: (url: string) => Promise<LinkPreviewResult | null>
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
    }
}
