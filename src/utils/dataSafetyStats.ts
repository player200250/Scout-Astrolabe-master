// src/utils/dataSafetyStats.ts
//
// 資料安全中心（N10）唯讀統計的純函式層。
// 從記憶體中的 boards / backups 推導出各項數量與「估算」體積，
// 不做任何清理（唯讀先行）。實體儲存總量另由元件用
// navigator.storage.estimate() 取得（那才是準確的 IndexedDB 用量）。

import type { BoardRecord, BackupRecord } from '../db'
import { getCardShapes } from './snapshot'

export interface VaultStats {
    boards: {
        total: number      // 全部（含 home/inbox/folder）
        normal: number     // 一般白板（排除 home/inbox/folder）
        archived: number   // 已封存
        sub: number        // 子板（有 parentId）
        folders: number    // 資料夾
    }
    cards: {
        total: number
        byType: Record<string, number>
    }
    imageCards: number
    /** 所有白板縮圖 base64 的估算位元組（另一體積源，見 bugs.md）。 */
    thumbnailBytes: number
    /** 所有白板 snapshot 序列化後的估算位元組（含殘留 base64 圖片）。 */
    snapshotBytes: number
    backups: {
        count: number
        bytes: number
    }
}

/** 估算一段字串（多為 base64/JSON，皆 ASCII）所佔位元組。 */
function approxBytes(s: string | null | undefined): number {
    return s ? s.length : 0
}

/** 人類可讀的位元組格式（B / KB / MB / GB，保留一位小數）。 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    const val = bytes / Math.pow(1024, i)
    return `${i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
}

export function computeVaultStats(boards: BoardRecord[], backups: BackupRecord[] = []): VaultStats {
    const byType: Record<string, number> = {}
    let cardTotal = 0
    let thumbnailBytes = 0
    let snapshotBytes = 0

    for (const b of boards) {
        thumbnailBytes += approxBytes(b.thumbnail)
        if (b.snapshot) snapshotBytes += approxBytes(JSON.stringify(b.snapshot))
        for (const shape of getCardShapes(b.snapshot)) {
            const t = (shape.props.type as string) ?? 'unknown'
            byType[t] = (byType[t] ?? 0) + 1
            cardTotal++
        }
    }

    const isFolder = (b: BoardRecord) => b.isFolder === true
    const backupBytes = backups.reduce((sum, bk) => sum + approxBytes(JSON.stringify(bk.boards ?? [])), 0)

    return {
        boards: {
            total: boards.length,
            normal: boards.filter(b => !b.isHome && !b.isInbox && !isFolder(b)).length,
            archived: boards.filter(b => b.status === 'archived').length,
            sub: boards.filter(b => b.parentId != null).length,
            folders: boards.filter(isFolder).length,
        },
        cards: { total: cardTotal, byType },
        imageCards: byType['image'] ?? 0,
        thumbnailBytes,
        snapshotBytes,
        backups: { count: backups.length, bytes: backupBytes },
    }
}
