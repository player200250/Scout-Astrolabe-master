// src/utils/weeklyReviewUtils.test.ts
import { describe, it, expect } from 'vitest'
import { getISOWeekKey, getWeekRange, recentWeekStarts, weekOwnerMonth, weeksOfMonth, extractNextWeekGoals, nextWeekFriday, computeRangeStats } from './weeklyReviewUtils'
import type { BoardRecord } from '../db'

describe('getISOWeekKey', () => {
    it('回傳格式為 week-YYYY-WW，週次補零', () => {
        // 2026-01-05 是 2026 年第 2 個週一
        expect(getISOWeekKey(new Date(2026, 0, 5))).toBe('week-2026-02')
    })

    it('週次號補成兩位數', () => {
        // 2026-01-01（週四）屬於 ISO 第 1 週
        expect(getISOWeekKey(new Date(2026, 0, 1))).toBe('week-2026-01')
    })

    it('年初屬於前一年最後一週時，年份歸前一年（ISO 規則）', () => {
        // 2021-01-01 是週五 → 屬於 2020 年第 53 週
        expect(getISOWeekKey(new Date(2021, 0, 1))).toBe('week-2020-53')
    })

    it('年末屬於下一年第一週時，年份歸下一年（ISO 規則）', () => {
        // 2018-12-31 是週一 → 屬於 2019 年第 1 週
        expect(getISOWeekKey(new Date(2018, 11, 31))).toBe('week-2019-01')
    })

    it('同一週內不同日期回傳相同鍵值', () => {
        const monday = getISOWeekKey(new Date(2026, 5, 1)) // 2026-06-01 週一
        const sunday = getISOWeekKey(new Date(2026, 5, 7)) // 2026-06-07 週日
        expect(monday).toBe(sunday)
    })
})

describe('getWeekRange', () => {
    it('start 為週一 00:00、end 為週日 23:59:59.999', () => {
        // 2026-06-07 是週日
        const { start, end } = getWeekRange(new Date(2026, 5, 7))

        expect(start.getDay()).toBe(1) // Monday
        expect(start.getHours()).toBe(0)
        expect(start.getMinutes()).toBe(0)
        expect(start.getDate()).toBe(1) // 2026-06-01

        expect(end.getDay()).toBe(0) // Sunday
        expect(end.getHours()).toBe(23)
        expect(end.getMinutes()).toBe(59)
        expect(end.getSeconds()).toBe(59)
        expect(end.getMilliseconds()).toBe(999)
        expect(end.getDate()).toBe(7) // 2026-06-07
    })

    it('傳入週一本身時，start 即為當天', () => {
        const { start } = getWeekRange(new Date(2026, 5, 1)) // 週一
        expect(start.getDate()).toBe(1)
        expect(start.getDay()).toBe(1)
    })

    it('end 比 start 晚 6 天又 23:59:59.999', () => {
        const { start, end } = getWeekRange(new Date(2026, 5, 3))
        const diffMs = end.getTime() - start.getTime()
        const sixDaysMs = 6 * 86400000 + (23 * 3600 + 59 * 60 + 59) * 1000 + 999
        expect(diffMs).toBe(sixDaysMs)
    })

    it('weekNum 與 getISOWeekKey 的週次號一致', () => {
        const date = new Date(2026, 5, 3)
        const { weekNum } = getWeekRange(date)
        const keyWeek = Number(getISOWeekKey(date).split('-')[2])
        expect(weekNum).toBe(keyWeek)
    })
})

describe('recentWeekStarts', () => {
    // 走勢圖的視窗：最後一格＝anchor 那一週，往左是更早的週
    it('最後一格是 anchor 所在週的週一，且每格相差 7 天', () => {
        const anchor = new Date('2026-09-29T12:00:00')   // 週二，第 40 週
        const out = recentWeekStarts(anchor, 8)
        expect(out).toHaveLength(8)
        // 最後一格 = 9/28（週一）
        expect(getWeekRange(out[7]).weekNum).toBe(getWeekRange(anchor).weekNum)
        for (const d of out) expect(d.getDay()).toBe(1)          // 全部都是週一
        for (let i = 1; i < out.length; i++) {
            expect(out[i].getTime() - out[i - 1].getTime()).toBe(7 * 86400000)
        }
    })

    it('跨年也連續（往回數會跨進前一年）', () => {
        const out = recentWeekStarts(new Date('2026-01-12T12:00:00'), 8)
        expect(out).toHaveLength(8)
        expect(out[0].getFullYear()).toBe(2025)
        for (let i = 1; i < out.length; i++) {
            expect(out[i].getTime() - out[i - 1].getTime()).toBe(7 * 86400000)
        }
    })
})

describe('weeksOfMonth / weekOwnerMonth', () => {
    const md = (ds: string) => new Date(ds + 'T12:00:00')
    const starts = (year: number, month: number) =>
        weeksOfMonth(year, month).map(d => `${d.getMonth() + 1}/${d.getDate()}`)

    it('一週歸屬看週四：第 40 週（9/28–10/4）的週四是 10/1 ⇒ 歸十月', () => {
        expect(weekOwnerMonth(md('2026-09-28'))).toEqual({ year: 2026, month: 9 })  // 10 月
        expect(weekOwnerMonth(md('2026-09-21'))).toEqual({ year: 2026, month: 8 })  // 9 月
    })

    it('2026 年 9 月剛好四週：8/31、9/7、9/14、9/21', () => {
        expect(starts(2026, 8)).toEqual(['8/31', '9/7', '9/14', '9/21'])
    })

    it('2026 年 8 月是 8/3、8/10、8/17、8/24（8/31 那週歸九月）', () => {
        expect(starts(2026, 7)).toEqual(['8/3', '8/10', '8/17', '8/24'])
    })

    // 最重要的一條：每一週只能有一個家，不能重複也不能漏掉
    it('整年掃過去，每一週剛好被算進一個月一次', () => {
        const seen = new Map<string, number>()
        for (let m = 0; m < 12; m++) {
            for (const w of weeksOfMonth(2026, m)) {
                const k = w.toDateString()
                seen.set(k, (seen.get(k) ?? 0) + 1)
            }
        }
        for (const [, n] of seen) expect(n).toBe(1)
        // 2026 有 53 個 ISO 週，扣掉跨年歸給 2025／2027 的，落在 2026 各月的應為 52
        expect(seen.size).toBeGreaterThanOrEqual(52)
    })
})

describe('extractNextWeekGoals', () => {
    const tpl = (goals: string) => '<h2>第 47 週回顧（11/16 - 11/22）</h2>'
        + '<p><strong>這週完成了什麼</strong></p><p>畫完線稿</p>'
        + '<p><strong>下週目標（3 件事）</strong></p>' + goals
        + '<p><strong>需要跟進的白板</strong></p><p>作品集</p>'

    it('一行一段：只取下週目標那一段，不吃到下一個標題', () => {
        expect(extractNextWeekGoals(tpl('<p>Spine 綁骨</p><p>投 2 家</p>'))).toEqual(['Spine 綁骨', '投 2 家'])
    })

    it('清單寫法也行，行首編號拿掉', () => {
        expect(extractNextWeekGoals(tpl('<ol><li><p>1. 上色</p></li><li><p>- 拆件</p></li></ol>'))).toEqual(['上色', '拆件'])
    })

    it('空段落與模板留白都略過；沒寫就是空陣列', () => {
        expect(extractNextWeekGoals(tpl('<p></p>'))).toEqual([])
        expect(extractNextWeekGoals('')).toEqual([])
        expect(extractNextWeekGoals('<p>沒有這個段落</p>')).toEqual([])
    })

    it('HTML 實體還原、行內格式去掉', () => {
        expect(extractNextWeekGoals(tpl('<p>A &amp; B <em>重要</em></p>'))).toEqual(['A & B 重要'])
    })

    it('三件寫在同一段、用圈號分隔（第 38 週的實際寫法）', () => {
        expect(extractNextWeekGoals(tpl('<p>① 決定求職線的去留；② 修掉 RC1／RC2；③ 決定 Supabase。</p>')))
            .toEqual(['決定求職線的去留', '修掉 RC1／RC2', '決定 Supabase'])
    })

    it('下週目標是最後一段也行', () => {
        expect(extractNextWeekGoals('<p><strong>下週目標（3 件事）</strong></p><p>只有這件</p>')).toEqual(['只有這件'])
    })
})

describe('nextWeekFriday', () => {
    it('第 47 週（11/16 週一）的下週五是 11/27', () => {
        expect(nextWeekFriday(new Date(2026, 10, 16))).toBe('2026-11-27')
    })
    it('跨月', () => {
        expect(nextWeekFriday(new Date(2026, 10, 30))).toBe('2026-12-11')
    })
})

describe('computeRangeStats：完成待辦的番茄數', () => {
    it('只加總這段期間完成的待辦；沒完成的番茄不算', () => {
        const at = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime()
        const boards = [{
            id: 'b', name: '工作', thumbnail: null, updatedAt: 0,
            snapshot: { document: { store: {
                'shape:t': { id: 'shape:t', typeName: 'shape', type: 'card', x: 0, y: 0, meta: {}, props: { type: 'todo', todos: [
                    { id: 'a', text: 'a', checked: true, checkedAt: at(11, 18), focusCount: 3 },
                    { id: 'b', text: 'b', checked: true, checkedAt: at(11, 19) },
                    { id: 'c', text: 'c', checked: false, focusCount: 5 },
                    { id: 'd', text: 'd', checked: true, checkedAt: at(11, 5), focusCount: 2 },
                ] } },
            } } },
        }] as unknown as BoardRecord[]
        const w = getWeekRange(new Date(2026, 10, 18))
        const s = computeRangeStats(boards, w.start, w.end)
        expect(s.completedTodos).toBe(2)
        expect(s.focusOnCompleted).toBe(3)
    })
})
