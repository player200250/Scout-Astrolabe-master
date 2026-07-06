// src/utils/imageMigration.ts
//
// TD-IMG 混合式遷移的純函式：從 board snapshot 找出「base64 image 卡且尚未存檔」的卡，
// 以及把遷移結果（shapeId→storedName）套回 snapshot。與 IO/React 無關，方便單元測試。

import type { TLEditorSnapshot } from 'tldraw'
import { getSnapshotStore, withUpdatedStore } from './snapshot'

export interface MigratableImage {
    shapeId: string
    dataUrl: string
}

export interface MigratedImage {
    shapeId: string
    storedName: string
}

/**
 * 找出某板 snapshot 中待遷移的 image 卡：type==='image'、image 為 base64 data URL、
 * 且尚未有 storedName。遠端 URL（link fallback / http 圖）不視為待遷移（無法存檔）。
 */
export function findMigratableImageShapes(snapshot: TLEditorSnapshot | null): MigratableImage[] {
    if (!snapshot) return []
    const store = getSnapshotStore(snapshot)
    const out: MigratableImage[] = []
    for (const rec of Object.values(store)) {
        if (rec.typeName !== 'shape' || rec.type !== 'card') continue
        const props = rec.props
        if (!props || props.type !== 'image') continue
        const image = props.image
        if (typeof image === 'string' && image.startsWith('data:') && !props.storedName) {
            out.push({ shapeId: rec.id, dataUrl: image })
        }
    }
    return out
}

/**
 * 把遷移結果套回 snapshot：對應 shape 的 image 清為 null、寫入 storedName。
 * 回傳新 snapshot（未變動則回原物件）。
 */
export function applyImageMigrations(
    snapshot: TLEditorSnapshot,
    migrated: MigratedImage[],
): TLEditorSnapshot {
    if (migrated.length === 0) return snapshot
    const store = getSnapshotStore(snapshot)
    const newStore = { ...store }
    let changed = false
    for (const { shapeId, storedName } of migrated) {
        const rec = store[shapeId]
        if (!rec) continue
        newStore[shapeId] = { ...rec, props: { ...(rec.props ?? {}), image: null, storedName } }
        changed = true
    }
    return changed ? withUpdatedStore(snapshot, newStore) : snapshot
}
