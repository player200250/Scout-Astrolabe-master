// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTaskMove } from './useTaskMove'
import { showToast } from '../utils/toast'
import type { TaskItem } from '../utils/todoScan'

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }))
const toast = vi.mocked(showToast)

const item = (over: Partial<TaskItem> = {}): TaskItem => ({
    boardId: 'b1', boardName: '作品集', shapeId: 's1', cardTitle: '', todoId: 't1',
    todoText: '待辦', dueDate: '2026-10-03', checked: false, focusCount: 0, x: 0, y: 0, ...over,
})

describe('useTaskMove', () => {
    beforeEach(() => toast.mockClear())

    it('改到期日並清掉時段，復原時放回原日期與時段', () => {
        const edit = vi.fn(() => true)
        const { result } = renderHook(() => useTaskMove(edit))
        result.current(item({ scheduledStart: '2026-10-03T14:00', scheduledEnd: '2026-10-03T15:00' }), '2026-12-01')
        expect(edit).toHaveBeenLastCalledWith('b1', 's1', 't1', { reschedule: { dueDate: '2026-12-01', schedule: null } })
        expect(toast.mock.calls[0][0]).toContain('排的時段已取消')
        toast.mock.calls[0][2]!.action!.run()
        expect(edit).toHaveBeenLastCalledWith('b1', 's1', 't1', {
            reschedule: { dueDate: '2026-10-03', schedule: { start: '2026-10-03T14:00', end: '2026-10-03T15:00' } },
        })
    })

    it('原本沒日期 → 復原成清掉；拖到無截止日顯示「已清掉截止日」', () => {
        const edit = vi.fn(() => true)
        const { result } = renderHook(() => useTaskMove(edit))
        result.current(item({ dueDate: '' }), null)
        expect(toast.mock.calls[0][0]).toBe('已清掉截止日')
        toast.mock.calls[0][2]!.action!.run()
        expect(edit).toHaveBeenLastCalledWith('b1', 's1', 't1', { reschedule: { dueDate: null, schedule: null } })
    })

    it('復原用最新的 editTodo（避免拿舊 boards 蓋掉其間的修改）', () => {
        const first = vi.fn(() => true), second = vi.fn(() => true)
        const { result, rerender } = renderHook(({ e }) => useTaskMove(e), { initialProps: { e: first } })
        result.current(item(), '2026-11-24')
        rerender({ e: second })
        toast.mock.calls[0][2]!.action!.run()
        expect(second).toHaveBeenCalledTimes(1)
        expect(first).toHaveBeenCalledTimes(1)
    })

    it('找不到這項就報錯、不給復原', () => {
        const { result } = renderHook(() => useTaskMove(() => false))
        result.current(item(), '2026-11-24')
        expect(toast).toHaveBeenCalledWith('改不了：這項待辦找不到了', 'error')
    })
})
