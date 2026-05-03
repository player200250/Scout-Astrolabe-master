import type { TLEditorSnapshot } from 'tldraw'

export interface SnapshotTodo {
    id: string
    text: string
    checked: boolean
    dueDate?: string | null
}

export interface SnapshotShapeProps {
    type?: string
    text?: string
    todos?: SnapshotTodo[]
    journalDate?: string | null
    linkedBoardId?: string | null
    w?: number
    h?: number
    cardStatus?: string | null
    priority?: string | null
    tags?: string[] | null
    [key: string]: unknown
}

export interface TLSnapshotStoreRecord {
    typeName: string
    id: string
    type?: string
    props?: SnapshotShapeProps
    x?: number
    y?: number
    index?: string
    parentId?: string
    isLocked?: boolean
    opacity?: number
    rotation?: number
    meta?: Record<string, unknown>
    [key: string]: unknown
}

export type TLSnapshotStore = Record<string, TLSnapshotStoreRecord>

export interface MutableSnapshot {
    document: {
        store: TLSnapshotStore
        schema: { schemaVersion: number; sequences: Record<string, number> }
    }
    session: Record<string, unknown>
}

export interface SnapshotCardShape {
    id: string
    x: number
    y: number
    props: SnapshotShapeProps
}

export function getSnapshotStore(snapshot: TLEditorSnapshot): TLSnapshotStore {
    return ((snapshot as unknown as MutableSnapshot).document?.store ?? {})
}

export function withUpdatedStore(
    snapshot: TLEditorSnapshot,
    newStore: TLSnapshotStore,
): TLEditorSnapshot {
    const s = snapshot as unknown as MutableSnapshot
    return { ...s, document: { ...s.document, store: newStore } } as unknown as TLEditorSnapshot
}

export function toMutableSnapshot(snapshot: TLEditorSnapshot | null): MutableSnapshot {
    if (snapshot) {
        const cloned = structuredClone(snapshot) as unknown as MutableSnapshot
        if (!cloned.document) cloned.document = { store: {}, schema: { schemaVersion: 2, sequences: {} } }
        if (!cloned.document.store) cloned.document.store = {}
        return cloned
    }
    return { document: { store: {}, schema: { schemaVersion: 2, sequences: {} } }, session: {} }
}

export function toTLEditorSnapshot(snap: MutableSnapshot): TLEditorSnapshot {
    return snap as unknown as TLEditorSnapshot
}

export function getCardShapes(snapshot: TLEditorSnapshot | null): SnapshotCardShape[] {
    if (!snapshot) return []
    const store = getSnapshotStore(snapshot)
    return Object.values(store)
        .filter(s => s.typeName === 'shape' && s.type === 'card')
        .map(s => ({ id: s.id, x: s.x ?? 0, y: s.y ?? 0, props: s.props ?? {} }))
}
