// src/hooks/useCardActivityStamps.ts
//
// 在白板編輯器裡替卡片記活動時間（RC16）：建立時寫 meta.createdAt、內容改動時寫 meta.updatedAt，
// 待辦打勾時寫 checkedAt。規則在 utils/cardActivity.ts。
//
// 只處理 source === 'user'：開板時載入 snapshot、雲端拉回來的變動是 'remote'，
// 那些不是「現在發生的活動」，蓋上現在的時間會讓整塊板看起來全是本週做的——正是 RC16 要修的錯。
import { useEffect } from 'react'
import type { Editor, TLShape } from 'tldraw'
import { isContentChange, stampCreated, stampUpdated, withCheckedAt } from '../utils/cardActivity'
import type { TodoItem } from '../components/card-shape/type/CardShape'

export function useCardActivityStamps(editor: Editor | null) {
    useEffect(() => {
        if (!editor) return
        const offCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
            if (source !== 'user' || shape.type !== 'card') return shape
            const now = Date.now()
            const props = shape.props as Record<string, unknown>
            const todos = withCheckedAt(undefined, props.todos as TodoItem[] | undefined, now)
            return {
                ...shape,
                meta: stampCreated(shape.meta, now),
                ...(todos !== props.todos ? { props: { ...props, todos } } : {}),
            } as TLShape
        })
        const offChange = editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next, source) => {
            if (source !== 'user' || next.type !== 'card') return next
            const prevProps = prev.props as Record<string, unknown>
            const nextProps = next.props as Record<string, unknown>
            if (!isContentChange(prevProps, nextProps)) return next
            const now = Date.now()
            const todos = withCheckedAt(prevProps.todos as TodoItem[] | undefined, nextProps.todos as TodoItem[] | undefined, now)
            return {
                ...next,
                meta: stampUpdated(next.meta, now),
                ...(todos !== nextProps.todos ? { props: { ...nextProps, todos } } : {}),
            } as TLShape
        })
        return () => { offCreate(); offChange() }
    }, [editor])
}
