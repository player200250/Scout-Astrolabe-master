// src/utils/quickCaptureCard.test.ts
import { describe, it, expect } from 'vitest'
import { appendQuickCaptureCard } from './quickCaptureCard'
import { getSnapshotStore } from './snapshot'

describe('appendQuickCaptureCard', () => {
    it('預設建文字卡', () => {
        const { snapshot, shapeId } = appendQuickCaptureCard(null, '一段話')
        const p = getSnapshotStore(snapshot)[shapeId]?.props as Record<string, unknown>
        expect(p.type).toBe('text')
        expect(p.text).toBe('一段話')
        expect(p.todos).toEqual([])
    })

    it('帶 todo：建成單項待辦卡，項目帶到期日、卡片標題另給', () => {
        const { snapshot, shapeId } = appendQuickCaptureCard(null, 'Spine 綁骨', 'goal', { title: '第 47 週定的下週目標', dueDate: '2026-11-27' })
        const p = getSnapshotStore(snapshot)[shapeId]?.props as { type: string; text: string; todos: { id: string; text: string; checked: boolean; dueDate: string | null }[] }
        expect(shapeId.startsWith('shape:goal_')).toBe(true)
        expect(p.type).toBe('todo')
        expect(p.text).toBe('第 47 週定的下週目標')
        expect(p.todos).toHaveLength(1)
        expect(p.todos[0]).toMatchObject({ text: 'Spine 綁骨', checked: false, dueDate: '2026-11-27' })
        expect(p.todos[0].id).toBeTruthy()
    })
})
