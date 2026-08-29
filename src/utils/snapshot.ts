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

// ── Card prop sanitization ───────────────────────────────────────────────────

const CARD_PROP_DEFAULTS: Record<string, unknown> = {
    text: '',
    image: null,
    todos: [],
    url: '',
    linkEmbedUrl: null,
    state: 'idle',
    preview: false,
    color: 'none',
    w: 240,
    h: 120,
    tags: [],
    cardStatus: 'none',
    priority: 'none',
    linkedBoardId: null,
    journalDate: null,
}

/**
 * 「瞬時 UI 旗標」：描述使用者**此刻正在做什麼**，不是卡片本身的資料。
 *
 * 它們跟著 props 一起被寫進 snapshot（`preview` 來自 `onDoubleClick` 的 `updateShape`，
 * `state` 來自進編輯模式），所以**不主動歸位就會在下次載入時復活**——
 * 實際踩過：關 App 時圖片預覽開著，重開直接卡在全螢幕遮罩、看不到白板。
 * `state: 'editing'` 同理（`CardShapeUtil` 的 `isEditing` 有 `|| p.state === 'editing'`）。
 *
 * 與 `CARD_PROP_DEFAULTS` 的差別：那份只補「缺漏」的欄位，這份是**無條件覆寫**。
 */
const EPHEMERAL_CARD_PROPS: Record<string, unknown> = {
    state: 'idle',
    preview: false,
}

/**
 * 把整份 snapshot 裡所有卡片的瞬時旗標歸位。
 *
 * 為什麼 `sanitizeCardProps` 之外還要這一支：啟動時的 `sanitizeBoards` 只掃**本機** DB，
 * 但雲端那份 snapshot 也可能帶著髒旗標（另一台裝置在預覽開著時推上去的），
 * 拉回來／合併完就直接寫進 db，繞過啟動清理 ⇒ 遮罩會「從雲端長回來」。
 * 實際踩過：本機清乾淨後重開，仍被另一張卡的全螢幕遮罩擋住。
 *
 * 沒有任何一張卡是髒的就回傳**原本的 reference**，呼叫端可據此跳過寫入。
 */
export function resetEphemeralCardProps(snapshot: TLEditorSnapshot | null): TLEditorSnapshot | null {
    if (!snapshot) return snapshot
    const store = getSnapshotStore(snapshot)
    let newStore: TLSnapshotStore | null = null
    for (const [id, rec] of Object.entries(store)) {
        if (rec?.typeName !== 'shape' || rec.type !== 'card' || !rec.props) continue
        const props = rec.props
        if (Object.entries(EPHEMERAL_CARD_PROPS).every(([k, v]) => props[k] === v)) continue
        if (!newStore) newStore = { ...store }
        newStore[id] = { ...rec, props: { ...props, ...EPHEMERAL_CARD_PROPS } }
    }
    return newStore ? withUpdatedStore(snapshot, newStore) : snapshot
}

export function sanitizeCardProps(props: SnapshotShapeProps): SnapshotShapeProps {
    const result = { ...props } as Record<string, unknown>
    let changed = false
    for (const key of Object.keys(result)) {
        if (result[key] === undefined) {
            result[key] = key in CARD_PROP_DEFAULTS ? CARD_PROP_DEFAULTS[key] : null
            changed = true
        }
    }
    for (const [key, def] of Object.entries(CARD_PROP_DEFAULTS)) {
        if (!(key in result)) {
            result[key] = def
            changed = true
        }
    }
    for (const [key, neutral] of Object.entries(EPHEMERAL_CARD_PROPS)) {
        if (result[key] !== neutral) {
            result[key] = neutral
            changed = true
        }
    }
    return changed ? (result as SnapshotShapeProps) : props
}

// ── Frame / Arrow prop defaults ──────────────────────────────────────────────

const FRAME_PROP_DEFAULTS: Record<string, unknown> = { name: '', w: 320, h: 240 }
const ARROW_PROP_DEFAULTS: Record<string, unknown> = {
    dash: 'draw', size: 'm', fill: 'none', color: 'black',
    labelColor: 'black', bend: 0, text: '', font: 'draw',
    start: { type: 'point', x: 0, y: 0 },
    end: { type: 'point', x: 100, y: 0 },
    arrowheadStart: 'none', arrowheadEnd: 'arrow',
    labelPosition: 0.5,
}

// ── Page record sanitization ─────────────────────────────────────────────────

/** Ensure all page records have the fields tldraw requires. */
export function sanitizePageRecords(snapshot: TLEditorSnapshot): TLEditorSnapshot {
    const store = getSnapshotStore(snapshot)
    const pages = Object.values(store).filter(r => r.typeName === 'page')
    if (pages.every(p => p.name !== undefined && p.index !== undefined && p.meta !== undefined)) return snapshot
    const newStore = { ...store }
    for (const page of pages) {
        if (page.name !== undefined && page.index !== undefined && page.meta !== undefined) continue
        newStore[page.id] = { name: '', index: 'a1', meta: {}, ...page }
    }
    return withUpdatedStore(snapshot, newStore)
}

/** Ensure the document:document record has all fields tldraw requires. */
export function sanitizeDocumentRecord(snapshot: TLEditorSnapshot): TLEditorSnapshot {
    const store = getSnapshotStore(snapshot)
    const doc = store['document:document']
    if (!doc || (doc.gridSize !== undefined && doc.name !== undefined)) return snapshot
    const fixed: TLSnapshotStoreRecord = {
        gridSize: 10,
        name: '',
        ...doc,
    }
    return withUpdatedStore(snapshot, { ...store, 'document:document': fixed })
}

/** Run all record sanitizers on a snapshot before passing it to tldraw. */
export function sanitizeSnapshot(snapshot: TLEditorSnapshot): TLEditorSnapshot {
    const snap = sanitizePageRecords(sanitizeDocumentRecord(snapshot))
    const store = getSnapshotStore(snap)
    const newStore = { ...store }
    let dirty = false

    for (const record of Object.values(store)) {
        if (record.typeName !== 'shape') continue
        const defaults = record.type === 'frame' ? FRAME_PROP_DEFAULTS
            : record.type === 'arrow' ? ARROW_PROP_DEFAULTS
            : null
        if (!defaults) continue
        const original = (record.props ?? {}) as Record<string, unknown>
        if (!Object.keys(defaults).some(k => !(k in original))) continue
        newStore[record.id] = { ...record, props: { ...defaults, ...original } as SnapshotShapeProps }
        dirty = true
    }

    return dirty ? withUpdatedStore(snap, newStore) : snap
}

export function getCardShapes(snapshot: TLEditorSnapshot | null): SnapshotCardShape[] {
    if (!snapshot) return []
    const store = getSnapshotStore(snapshot)
    return Object.values(store)
        .filter(s => s.typeName === 'shape' && s.type === 'card')
        .map(s => ({ id: s.id, x: s.x ?? 0, y: s.y ?? 0, props: s.props ?? {} }))
}
