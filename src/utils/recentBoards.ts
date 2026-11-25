// src/utils/recentBoards.ts
//
// 側邊欄「最近使用」清單（v1.8.4 驗收觀察）。
// 以前一打開白板，它就從清單消失、上一塊插回最上面，滑鼠下的項目瞬間換成別塊，連點時容易點錯。
// 改成：滑鼠在清單上時「凍結」當下的順序（剛打開的那塊留在原位、顯示成目前白板），滑鼠離開才重排。
import type { BoardRecord } from '../db'

export const RECENT_LIMIT = 5

const eligible = (b: BoardRecord) =>
    !b.isFolder && !b.isJournal && !b.isHome && !b.isInbox && b.status !== 'archived' && b.status !== 'pinned'

/**
 * @param frozen 滑鼠進入清單當下的 id 順序；null＝沒凍結，照最近造訪重排
 */
export function pickRecentBoards(
    boards: BoardRecord[],
    activeBoardId: string | null | undefined,
    frozen: string[] | null,
    limit = RECENT_LIMIT,
): BoardRecord[] {
    if (frozen) {
        const byId = new Map(boards.map(b => [b.id, b]))
        // 凍結時保留原順序；被刪掉／改成釘選或封存的照樣拿掉（那是使用者自己的動作）
        return frozen.map(id => byId.get(id)).filter((b): b is BoardRecord => !!b && eligible(b))
    }
    return boards
        .filter(b => b.id !== activeBoardId && eligible(b) && b.lastVisitedAt)
        .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
        .slice(0, limit)
}
