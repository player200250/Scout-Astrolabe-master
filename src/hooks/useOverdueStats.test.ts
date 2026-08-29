// @vitest-environment jsdom
// src/hooks/useOverdueStats.test.ts
//
// 計算邏輯是純函式，主體測 countDueTodos；
// hook 本身只驗「有把今天的日期接進去」這一件事（換日後同一份資料要變逾期）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { BoardRecord } from '../db'
import { countDueTodos, useOverdueStats } from './useOverdueStats'

// 造一塊只含 todo 卡的白板。snapshot 的形狀要和 getCardShapes 讀的一致。
function boardWithTodos(todos: { checked?: boolean; dueDate?: string | null }[], type = 'todo'): BoardRecord {
    return {
        id: 'b1', name: '板', thumbnail: null, updatedAt: 0,
        snapshot: {
            document: {
                store: {
                    'shape:1': {
                        typeName: 'shape', id: 'shape:1', type: 'card', x: 0, y: 0,
                        props: {
                            type,
                            todos: todos.map((t, i) => ({ id: `t${i}`, text: `待辦 ${i}`, checked: !!t.checked, dueDate: t.dueDate ?? null })),
                        },
                    },
                },
                schema: { schemaVersion: 2, sequences: {} },
            },
            session: {},
        } as unknown as BoardRecord['snapshot'],
    }
}

describe('countDueTodos', () => {
    it('到期日早於今天算逾期、等於今天算今日', () => {
        const boards = [boardWithTodos([
            { dueDate: '2026-08-01' },
            { dueDate: '2026-08-28' },
            { dueDate: '2026-08-29' },
            { dueDate: '2026-09-01' },   // 未來，兩邊都不算
        ])]
        expect(countDueTodos(boards, '2026-08-29')).toEqual({ overdueCount: 2, todayCount: 1 })
    })

    it('已勾選的待辦不計入', () => {
        const boards = [boardWithTodos([
            { dueDate: '2026-08-01', checked: true },
            { dueDate: '2026-08-29', checked: true },
        ])]
        expect(countDueTodos(boards, '2026-08-29')).toEqual({ overdueCount: 0, todayCount: 0 })
    })

    it('沒有到期日的待辦不計入', () => {
        const boards = [boardWithTodos([{ dueDate: null }, {}])]
        expect(countDueTodos(boards, '2026-08-29')).toEqual({ overdueCount: 0, todayCount: 0 })
    })

    it('只數 todo 卡，其他型別的卡略過', () => {
        const boards = [boardWithTodos([{ dueDate: '2026-08-01' }], 'text')]
        expect(countDueTodos(boards, '2026-08-29')).toEqual({ overdueCount: 0, todayCount: 0 })
    })

    it('跨多塊白板累加', () => {
        const boards = [
            boardWithTodos([{ dueDate: '2026-08-01' }]),
            boardWithTodos([{ dueDate: '2026-08-02' }, { dueDate: '2026-08-29' }]),
        ]
        expect(countDueTodos(boards, '2026-08-29')).toEqual({ overdueCount: 2, todayCount: 1 })
    })

    it('沒有白板 / snapshot 為 null 時回 0，不丟例外', () => {
        expect(countDueTodos([], '2026-08-29')).toEqual({ overdueCount: 0, todayCount: 0 })
        const empty: BoardRecord = { id: 'b', name: '空板', snapshot: null, thumbnail: null, updatedAt: 0 }
        expect(countDueTodos([empty], '2026-08-29')).toEqual({ overdueCount: 0, todayCount: 0 })
    })

    it('字串直接比大小＝跨月跨年也正確（YYYY-MM-DD 的字典序等同時間序）', () => {
        const boards = [boardWithTodos([{ dueDate: '2025-12-31' }, { dueDate: '2026-01-01' }])]
        expect(countDueTodos(boards, '2026-01-01')).toEqual({ overdueCount: 1, todayCount: 1 })
    })
})

describe('useOverdueStats', () => {
    afterEach(() => vi.useRealTimers())

    it('用「今天」當基準日（換日後同一份資料會變成逾期）', () => {
        const boards = [boardWithTodos([{ dueDate: '2026-08-29' }])]

        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-29T10:00:00'))
        expect(renderHook(() => useOverdueStats(boards)).result.current)
            .toEqual({ overdueCount: 0, todayCount: 1 })

        vi.setSystemTime(new Date('2026-08-30T10:00:00'))
        expect(renderHook(() => useOverdueStats(boards)).result.current)
            .toEqual({ overdueCount: 1, todayCount: 0 })
    })
})
