import { describe, it, expect } from 'vitest'
import { getGroupKey, groupTasks, matchesQuery } from './taskCenterBoard'
import type { TaskItem } from './todoScan'

const TODAY = '2026-11-23'
const WEEK = '2026-11-30'

function task(over: Partial<TaskItem>): TaskItem {
    return {
        boardId: 'b1', boardName: '作品集', shapeId: 's1', cardTitle: '', todoId: 't1',
        todoText: '待辦', dueDate: '', checked: false, focusCount: 0, x: 0, y: 0, ...over,
    }
}

describe('getGroupKey', () => {
    it('依到期日分進五欄', () => {
        expect(getGroupKey(undefined, TODAY, WEEK)).toBe('noduedate')
        expect(getGroupKey('2026-10-03', TODAY, WEEK)).toBe('overdue')
        expect(getGroupKey(TODAY, TODAY, WEEK)).toBe('today')
        expect(getGroupKey(WEEK, TODAY, WEEK)).toBe('week')
        expect(getGroupKey('2026-12-01', TODAY, WEEK)).toBe('later')
    })
})

describe('matchesQuery', () => {
    it('比對待辦文字與白板名稱、不分大小寫', () => {
        const t = task({ todoText: 'Spine 綁骨', boardName: '作品集 · 求職' })
        expect(matchesQuery(t, 'spine')).toBe(true)
        expect(matchesQuery(t, '求職')).toBe(true)
        expect(matchesQuery(t, '  ')).toBe(true)
        expect(matchesQuery(t, '收件匣')).toBe(false)
    })
})

describe('groupTasks', () => {
    const items = [
        task({ todoId: 'a', todoText: '女主角線稿', dueDate: '2026-10-03' }),
        task({ todoId: 'b', todoText: '已做完', checked: true }),
        task({ todoId: 'c', todoText: '沒期限' }),
    ]

    it('預設藏已完成', () => {
        const g = groupTasks(items, '', false, TODAY, WEEK)
        expect(g.overdue.map(t => t.todoId)).toEqual(['a'])
        expect(g.noduedate.map(t => t.todoId)).toEqual(['c'])
    })

    it('打開「顯示已完成」才列出勾掉的', () => {
        expect(groupTasks(items, '', true, TODAY, WEEK).noduedate.map(t => t.todoId)).toEqual(['b', 'c'])
    })

    it('搜尋同時過濾所有欄', () => {
        const g = groupTasks(items, '女主角', false, TODAY, WEEK)
        expect(g.overdue).toHaveLength(1)
        expect(g.noduedate).toHaveLength(0)
    })
})
