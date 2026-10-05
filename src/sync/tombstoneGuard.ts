// src/sync/tombstoneGuard.ts
// 「雲端有、本機沒有」的板，什麼時候可以判成「本機永久刪除了」而推墓碑？
//
// ── 為什麼要有這層（2026-10-05 事故）──────────────────────────────────────
// 舊版 Electron（Chromium 138）打不開被新版 Chromium 寫過的 IndexedDB，會**整個刪掉重建**。
// 重建後本機一塊板都沒有，但 localStorage 裡的同步紀錄（pushed）還在 ⇒ 每一塊都符合
// 「推過、雲端還在、本機不見」⇒ 引擎替 29 塊板全推了墓碑，雲端跟著被清空。
//
// 正常的永久刪除在刪的當下就會推墓碑（notifyBoardDeleted），走到這條補推路徑的只會是
// 「刪除時剛好離線」的零星一兩塊。一輪冒出好幾塊 ⇒ 不是使用者刪的，是本機資料不見了。
// 這時候寧可全部拉回來（最壞＝刪過的板復活，再刪一次就好），也不能推墓碑（最壞＝全部資料沒了）。

/** 一輪最多自動補推幾塊墓碑；超過就當成本機資料庫被重置，一塊都不推。 */
export const MAX_AUTO_TOMBSTONES_PER_ROUND = 2

export interface OrphanCandidate {
    id: string
    /** 雲端那列是否已經是墓碑（deleted_at 有值） */
    remoteDeleted: boolean
}

export interface OrphanPlan {
    /** 可以推墓碑的板 */
    tombstone: string[]
    /** 改成從雲端拉回來的板 */
    restore: string[]
    /** 是否判定為「本機資料被重置」（呼叫端據此提示使用者） */
    suspectedLocalReset: boolean
}

/**
 * @param candidates 這一輪「推過、雲端不比我們推的新、本機卻不存在」的板
 */
export function planOrphanBoards(candidates: OrphanCandidate[]): OrphanPlan {
    // 雲端已經是墓碑 ⇒ 雲端早就知道它沒了，不必再推一次，也不算進可疑數量
    const live = candidates.filter(c => !c.remoteDeleted).map(c => c.id)
    if (live.length > MAX_AUTO_TOMBSTONES_PER_ROUND) {
        return { tombstone: [], restore: live, suspectedLocalReset: true }
    }
    return { tombstone: live, restore: [], suspectedLocalReset: false }
}
