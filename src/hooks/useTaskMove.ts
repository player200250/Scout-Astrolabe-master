// src/hooks/useTaskMove.ts — 任務中心拖卡片到別欄＝改到期日，附 6 秒復原
import { useCallback, useEffect, useRef } from 'react'
import type { TaskItem } from '../utils/todoScan'
import type { TodoChange } from './useTodoEdits'
import { formatDueDate, getTodayStr } from '../utils/date'
import { showToast } from '../utils/toast'
import { UNDO_MS } from './usePomodoro'

type EditTodo = (boardId: string, shapeId: string, todoId: string, change: TodoChange) => boolean

export function useTaskMove(editTodo: EditTodo) {
    // 復原是 6 秒後才按：要用當下最新的 editTodo，舊的會帶著搬動前的 boards，把其間的其他修改蓋掉
    const editRef = useRef(editTodo)
    useEffect(() => { editRef.current = editTodo }, [editTodo])

    return useCallback((item: TaskItem, dueDate: string | null) => {
        const { boardId, shapeId, todoId } = item
        // 換了日期，原本排的時段就不成立了（使用者 11/23 拍板：清掉）
        if (!editRef.current(boardId, shapeId, todoId, { reschedule: { dueDate, schedule: null } })) {
            showToast('改不了：這項待辦找不到了', 'error')
            return
        }
        const prevSchedule = item.scheduledStart && item.scheduledEnd
            ? { start: item.scheduledStart, end: item.scheduledEnd } : null
        const label = dueDate ? `已改到 ${formatDueDate(dueDate, getTodayStr())}` : '已清掉截止日'
        showToast(prevSchedule ? `${label}（排的時段已取消）` : label, 'info', {
            durationMs: UNDO_MS,
            action: {
                label: '復原',
                run: () => { editRef.current(boardId, shapeId, todoId, { reschedule: { dueDate: item.dueDate || null, schedule: prevSchedule } }) },
            },
        })
    }, [])
}
