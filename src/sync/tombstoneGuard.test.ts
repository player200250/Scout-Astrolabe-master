// src/sync/tombstoneGuard.test.ts
import { describe, it, expect } from 'vitest'
import { planOrphanBoards, MAX_AUTO_TOMBSTONES_PER_ROUND } from './tombstoneGuard'

const live = (id: string) => ({ id, remoteDeleted: false })
const dead = (id: string) => ({ id, remoteDeleted: true })

describe('planOrphanBoards', () => {
    it('零星一兩塊（刪除時剛好離線）照常推墓碑', () => {
        expect(planOrphanBoards([live('a')])).toEqual({ tombstone: ['a'], restore: [], suspectedLocalReset: false })
        expect(planOrphanBoards([live('a'), live('b')]).tombstone).toEqual(['a', 'b'])
    })

    it('超過上限 ⇒ 判定本機被重置：一塊墓碑都不推，全部拉回來（2026-10-05 事故的 29 塊）', () => {
        const ids = Array.from({ length: 29 }, (_, i) => `b${i}`)
        const plan = planOrphanBoards(ids.map(live))
        expect(plan.tombstone).toEqual([])
        expect(plan.restore).toEqual(ids)
        expect(plan.suspectedLocalReset).toBe(true)
    })

    it('剛好在上限上不算可疑，多一塊就算', () => {
        const at = Array.from({ length: MAX_AUTO_TOMBSTONES_PER_ROUND }, (_, i) => live(`b${i}`))
        expect(planOrphanBoards(at).suspectedLocalReset).toBe(false)
        expect(planOrphanBoards([...at, live('x')]).suspectedLocalReset).toBe(true)
    })

    it('雲端已是墓碑的不再推、也不算進可疑數量', () => {
        const plan = planOrphanBoards([dead('d1'), dead('d2'), dead('d3'), live('a')])
        expect(plan).toEqual({ tombstone: ['a'], restore: [], suspectedLocalReset: false })
    })

    it('沒有候選時什麼都不做', () => {
        expect(planOrphanBoards([])).toEqual({ tombstone: [], restore: [], suspectedLocalReset: false })
    })
})
