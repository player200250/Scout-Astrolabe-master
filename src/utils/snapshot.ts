import type { TLEditorSnapshot } from 'tldraw'

export interface SnapshotTodo {
    id: string
    text: string
    checked: boolean
    dueDate?: string
}

export interface SnapshotCardShape {
    id: string
    x: number
    y: number
    props: {
        type: string
        text?: string
        todos?: SnapshotTodo[]
        journalDate?: string
        cardStatus?: string
        priority?: string
        tags?: string[]
    }
}

export function getCardShapes(snapshot: TLEditorSnapshot | null): SnapshotCardShape[] {
    if (!snapshot) return []
    const store = (snapshot as any).document?.store ?? {}
    return (Object.values(store) as any[]).filter(
        s => s.typeName === 'shape' && s.type === 'card'
    ) as SnapshotCardShape[]
}
