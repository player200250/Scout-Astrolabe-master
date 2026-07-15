import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardRecord } from '../db'
import { saveBoard } from '../utils/boardDb'
import { rewriteTagInBoards } from '../utils/tagManager'
import { emitAppEvent } from '../utils/appEvents'

/** useTags 需共用的核心 board state（由 useBoardManager 傳入） */
export interface TagsSharedState {
    boards: BoardRecord[]
    setBoards: Dispatch<SetStateAction<BoardRecord[]>>
}

/**
 * 標籤領域（N4）：跨白板改名／合併／刪除標籤。
 * - handleRewriteTag：to 給字串＝改名（目標已存在即合併），給 null＝刪除。
 *   只存有變動的白板，並逐張發 update-shape-props-in-editor，讓當前掛載的 editor
 *   跟上新 tags——否則它的自動存檔會用舊 props 把改名蓋回去。
 *   對沒掛載 editor 的白板，該事件無人接收，不影響已寫入 DB 的 snapshot。
 */
export function useTags(state: TagsSharedState) {
    const { boards, setBoards } = state

    const handleRewriteTag = useCallback(async (from: string, to: string | null) => {
        const { changedBoards, updates } = rewriteTagInBoards(boards, from, to)
        if (changedBoards.length === 0) return

        await Promise.all(changedBoards.map(saveBoard))

        const byId = new Map(changedBoards.map(b => [b.id, b]))
        setBoards(prev => prev.map(b => byId.get(b.id) ?? b))

        for (const u of updates) {
            emitAppEvent('update-shape-props-in-editor', { shapeId: u.shapeId, props: { tags: u.tags } })
        }
    }, [boards, setBoards])

    return { handleRewriteTag }
}
