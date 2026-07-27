// src/hooks/useCloudSync.ts
// 自動同步引擎與 React state 之間的接線（S0(b)）。
//
// 引擎本身（src/sync/syncEngine.ts）刻意不認識 React——它只管排程、網路與 IndexedDB，
// 把結果用事件丟出來。這個 hook 就是唯一的翻譯層：
//   sync-boards-updated → 套進 boards state（不然畫面要等下次重載才看得到）
//   sync-remote-newer   → 彈一則帶「立即載入」的提示（絕不靜默覆蓋正在開的板）
//   sync-status-changed → 給 UI 顯示的狀態
import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { onAppEvent, emitAppEvent } from '../utils/appEvents'
import { showToast } from '../utils/toast'
import { startSyncEngine, stopSyncEngine, setActiveBoardForSync, getSyncStatus } from '../sync/syncEngine'
import type { SyncStatus } from '../sync/syncStatus'

export interface CloudSyncSharedState {
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
    activeBoardId: string | null
    setActiveBoardId: Dispatch<SetStateAction<string | null>>
    /** 白板還在載入時不要啟動引擎，否則會對著空的 boards state 套用拉回結果 */
    enabled: boolean
}

/**
 * 把從雲端拉回來的板併進現有清單（純函式，方便推理也方便測）。
 *
 * 三種情況：本機沒有 → 新增；本機有 → 換成雲端版；雲端標記已刪除 → 從清單移除
 * （側邊欄只顯示未刪除的板，垃圾桶另外從 DB 讀）。
 */
export function mergeSyncedBoards(current: BoardRecord[], incoming: BoardRecord[]): BoardRecord[] {
    if (incoming.length === 0) return current
    const next = [...current]
    for (const board of incoming) {
        const idx = next.findIndex(b => b.id === board.id)
        if (board.deletedAt) {
            if (idx >= 0) next.splice(idx, 1)
            continue
        }
        if (idx >= 0) next[idx] = board
        else next.push(board)
    }
    return next
}

export function useCloudSync(state: CloudSyncSharedState) {
    const { setBoards, activeBoardId, setActiveBoardId, enabled } = state
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus())

    // 引擎的生命週期：載入完成才啟動，元件卸載時停掉計時器
    useEffect(() => {
        if (!enabled) return
        startSyncEngine()
        setSyncStatus(getSyncStatus())
        return () => stopSyncEngine()
    }, [enabled])

    // 畫布正開著哪塊板 → 引擎據此決定「不能靜默覆蓋的是哪一塊」
    useEffect(() => {
        setActiveBoardForSync(activeBoardId)
    }, [activeBoardId])

    useEffect(() => onAppEvent('sync-status-changed', next => setSyncStatus(next)), [])

    const applyIncoming = useCallback((incoming: BoardRecord[]) => {
        setBoards(prev => {
            const merged = mergeSyncedBoards(prev, incoming)
            // 正在開的那塊板被另一端刪掉了（使用者按了提示的「立即載入」才會走到這）：
            // 不換掉 activeBoardId 的話畫布會指向一塊不存在的板
            if (activeBoardId && !merged.some(b => b.id === activeBoardId)) {
                setActiveBoardId(merged[0]?.id ?? null)
            }
            return merged
        })
        // 另一端刪掉的板會進本機垃圾桶，badge 要跟著更新
        if (incoming.some(b => b.deletedAt)) emitAppEvent('trash-count-changed')
    }, [setBoards, activeBoardId, setActiveBoardId])

    useEffect(() => onAppEvent('sync-boards-updated', ({ boards }) => {
        applyIncoming(boards)
        const changed = boards.filter(b => !b.deletedAt).length
        const removed = boards.length - changed
        const parts: string[] = []
        if (changed > 0) parts.push(`更新 ${changed} 塊白板`)
        if (removed > 0) parts.push(`移除 ${removed} 塊（另一端已刪除）`)
        if (parts.length > 0) showToast(`☁️ 已從雲端${parts.join('、')}`)
    }), [applyIncoming])

    // 第 4 項：正在開著的板遠端較新 → 提示，不覆蓋。
    // 不自動消失（durationMs: null）——這是需要使用者做決定的事，飄過去就沒了等於沒問。
    useEffect(() => onAppEvent('sync-remote-newer', ({ boardName, remoteUpdatedAt, apply }) => {
        showToast(
            `「${boardName}」在雲端有較新的版本（${new Date(remoteUpdatedAt).toLocaleString()}）。\n` +
            `你正開著這塊板，所以沒有自動覆蓋。`,
            'info',
            {
                durationMs: null,
                action: {
                    label: '立即載入',
                    run: () => {
                        void apply()
                            .then(() => showToast(`已載入雲端版本的「${boardName}」`, 'success'))
                            .catch(e => showToast(`載入失敗：${e instanceof Error ? e.message : String(e)}`, 'error'))
                    },
                },
            },
        )
    }), [])

    return { syncStatus }
}
