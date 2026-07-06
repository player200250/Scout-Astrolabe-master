// src/hooks/useImageMigration.ts
//
// TD-IMG 混合式遷移的協調層。相容渲染（storedName 優先、否則 fallback base64）已由
// imageStore.getImageSrc 達成；此 hook 負責把「舊的 base64 image 卡」在背景 idle 時
// 逐板遷移成存檔格式：
//   - 一次只處理一板，遷完釋放再排下一板（控制記憶體峰值，避免遷移當下 OOM）。
//   - 跳過目前開啟中的 active 板（其 snapshot 在 editor 記憶體內，直接寫 db 會打架）；
//     待切換離開後自然成為可遷移對象。
//   - 以 storedName 是否存在做冪等；processedRef 防同一 session 無限重試。
//   - 遷移期間暫停 autoBackup（migrationState 旗標），全部遷完做一次乾淨備份 + trim。
//   - 無 electronAPI（未來 PWA）時不啟動。

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { saveAutoBackup } from '../db'
import { saveBoard } from '../utils/boardDb'
import { findMigratableImageShapes, applyImageMigrations, type MigratedImage } from '../utils/imageMigration'
import { setImageMigrationRunning } from '../utils/migrationState'
import * as imageStore from '../platform/imageStore'

interface UseImageMigrationArgs {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
    activeBoardId: string | null
    enabled: boolean
}

const scheduleIdle = (cb: () => void): void => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
    if (typeof ric === 'function') ric(cb, { timeout: 3000 })
    else setTimeout(cb, 1500)
}

/** 遷移單一板：存檔每張 base64 image 卡、套回 snapshot、寫 db + 更新 state。回傳是否有實際遷移。 */
async function migrateBoard(
    board: BoardRecord,
    isStillInactive: () => boolean,
    setBoards: UseImageMigrationArgs['setBoards'],
): Promise<boolean> {
    const migratable = findMigratableImageShapes(board.snapshot)
    if (migratable.length === 0) return false
    const migrated: MigratedImage[] = []
    for (const m of migratable) {
        const storedName = await imageStore.saveImage(m.dataUrl)
        if (storedName) migrated.push({ shapeId: m.shapeId, storedName })
    }
    if (migrated.length === 0) return false
    // 遷移途中該板若被開啟為 active，放棄寫入（避免覆蓋 editor 的 in-memory 版本），下輪重試
    if (!isStillInactive()) return false
    const updated: BoardRecord = { ...board, snapshot: applyImageMigrations(board.snapshot!, migrated), updatedAt: Date.now() }
    await saveBoard(updated)
    setBoards(prev => prev.map(b => b.id === updated.id ? updated : b))
    return true
}

export function useImageMigration({ boards, setBoards, activeBoardId, enabled }: UseImageMigrationArgs) {
    const [migrating, setMigrating] = useState(false)
    const boardsRef = useRef(boards)
    const activeIdRef = useRef(activeBoardId)
    const runningRef = useRef(false)
    const processedRef = useRef<Set<string>>(new Set())
    const didMigrateRef = useRef(false)
    const mountedRef = useRef(true)

    boardsRef.current = boards
    activeIdRef.current = activeBoardId

    useEffect(() => () => { mountedRef.current = false }, [])

    const finishRun = useCallback(async () => {
        setImageMigrationRunning(false)
        setMigrating(false)
        if (didMigrateRef.current) {
            didMigrateRef.current = false
            // 全部遷完做一次乾淨備份（此時 vault 已無 base64），saveAutoBackup 內含 trimBackups
            try { await saveAutoBackup(boardsRef.current.filter(b => !b.deletedAt)) } catch (e) { console.error('[img-migration] 乾淨備份失敗', e) }
        }
    }, [])

    const tick = useCallback(async () => {
        if (!mountedRef.current || runningRef.current) return
        if (typeof window === 'undefined' || !window.electronAPI?.saveImage) return

        const target = boardsRef.current.find(b =>
            b.id !== activeIdRef.current &&
            !b.deletedAt &&
            !processedRef.current.has(b.id) &&
            findMigratableImageShapes(b.snapshot).length > 0
        )
        if (!target) { await finishRun(); return }

        runningRef.current = true
        setMigrating(true)
        setImageMigrationRunning(true)
        try {
            const did = await migrateBoard(target, () => activeIdRef.current !== target.id, setBoards)
            processedRef.current.add(target.id)  // 標記已嘗試，避免無限重試（重啟後再試未成功的）
            if (did) didMigrateRef.current = true
        } catch (err) {
            console.error('[img-migration] 遷移失敗', err)
            processedRef.current.add(target.id)
        } finally {
            runningRef.current = false
        }
        scheduleIdle(() => { void tick() })
    }, [setBoards, finishRun])

    // 啟用後、以及 active 板切換時，重新啟動背景遷移（切走的板此時可能變成可遷移對象）
    useEffect(() => {
        if (!enabled) return
        scheduleIdle(() => { void tick() })
    }, [enabled, activeBoardId, tick])

    /** 手動觸發：清掉本 session 的 processed 記錄並立即把所有非 active 板遷移完。回傳遷移的板數。 */
    const migrateAllNow = useCallback(async (): Promise<number> => {
        if (!window.electronAPI?.saveImage || runningRef.current) return 0
        runningRef.current = true
        setMigrating(true)
        setImageMigrationRunning(true)
        processedRef.current = new Set()
        let count = 0
        try {
            for (const b of boardsRef.current) {
                if (b.id === activeIdRef.current || b.deletedAt) continue
                const did = await migrateBoard(b, () => activeIdRef.current !== b.id, setBoards)
                processedRef.current.add(b.id)
                if (did) { count++; didMigrateRef.current = true }
            }
        } finally {
            runningRef.current = false
            await finishRun()
        }
        return count
    }, [setBoards, finishRun])

    return { migrating, migrateAllNow }
}
