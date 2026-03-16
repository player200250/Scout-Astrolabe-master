// src/components/card-shape/sub-components/TodoContent.tsx
import React, { useState, useRef, useCallback } from 'react' // 🌟 修正：引入 React 以支援 React.FocusEvent
import { useEditor } from 'tldraw'
import type { TLCardShape, TodoItem } from '../type/CardShape'// 🌟 修正：修正路徑分隔符號

// 常數定義
const ITEM_HEIGHT = 28
const CARD_MIN_HEIGHT = 120 // 🌟 統一最小高度

/**
 * 外部化高度計算邏輯，避免每次渲染重複宣告
 */
const calculateNewHeight = (todosCount: number, editing: boolean) => {
    const BASE_PADDING = 80
    const listHeight = todosCount * ITEM_HEIGHT
    const addAreaHeight = editing ? 48 : 0
    return Math.max(CARD_MIN_HEIGHT, BASE_PADDING + listHeight + addAreaHeight)
}

interface TodoContentProps {
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
}

export const TodoContent = ({ shape, isEditing, exitEdit }: TodoContentProps) => {
    const editor = useEditor()
    const { id, props } = shape
    const todos = props.todos || []
    
    const containerRef = useRef<HTMLDivElement>(null)
    const [newText, setNewText] = useState('')

    // --- 核心邏輯區 (使用 useCallback 優化記憶體與效能) ---

    const updateTodos = useCallback((newTodos: TodoItem[]) => {
        editor.updateShape({
            id,
            type: 'card',
            props: { 
                todos: newTodos,
                h: calculateNewHeight(newTodos.length, isEditing)
            }
        })
    }, [editor, id, isEditing])

    const toggle = useCallback((todoId: string) => {
        const updated = todos.map(t => t.id === todoId ? { ...t, checked: !t.checked } : t)
        updateTodos(updated)
    }, [todos, updateTodos])

    const addTodo = useCallback(() => {
        const trimmed = newText.trim()
        if (!trimmed) return
        const newTodo: TodoItem = { id: `todo_${Date.now()}`, text: trimmed, checked: false }
        updateTodos([...todos, newTodo])
        setNewText('')
    }, [newText, todos, updateTodos])

    const deleteTodo = useCallback((todoId: string) => {
        const updated = todos.filter(t => t.id !== todoId)
        updateTodos(updated)
        // 保持容器焦點，防止非預期退出
        requestAnimationFrame(() => containerRef.current?.focus())
    }, [todos, updateTodos])

    const updateTodoText = useCallback((todoId: string, text: string) => {
        const updated = todos.map(t => t.id === todoId ? { ...t, text } : t)
        editor.updateShape({ id, type: 'card', props: { todos: updated } })
    }, [editor, id, todos])

    const updateTitle = useCallback((text: string) => {
        editor.updateShape({ id, type: 'card', props: { text } })
    }, [editor, id])

    // 智慧退場邏輯
    const handleBlur = (e: React.FocusEvent) => {
        const nextFocus = e.relatedTarget as Node | null
        if (!containerRef.current?.contains(nextFocus)) {
            exitEdit()
            if (editor.getEditingShapeId() === id) {
                editor.setEditingShape(null)
            }
        }
    }

    // --- 渲染 UI 區 ---
    return (
        <div
            ref={containerRef}
            className="todo-container"
            tabIndex={-1}
            onBlur={handleBlur}
            style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12, 
                height: '100%', 
                outline: 'none',
                padding: '16px' 
            }}
            onPointerDown={(e) => { if (isEditing) e.stopPropagation() }}
        >
            {/* 標題區域 */}
            {isEditing ? (
                <input
                    autoFocus
                    defaultValue={props.text}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                        updateTitle(e.target.value)
                        handleBlur(e)
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') {
                            exitEdit()
                            editor.setEditingShape(null)
                        }
                    }}
                    placeholder="待辦事項標題..."
                    style={{
                        border: 'none', borderBottom: '2px solid #333', padding: 4, outline: 'none',
                        fontWeight: 'bold', fontSize: 16, backgroundColor: 'transparent'
                    }}
                />
            ) : (
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold', color: '#333' }}>
                    {props.text || '待辦事項'}
                </h3>
            )}

            {/* 列表區域 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flexGrow: 1 }}>
                {todos.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: ITEM_HEIGHT }}>
                        <input
                            type="checkbox"
                            checked={t.checked}
                            onChange={() => toggle(t.id)}
                            onBlur={handleBlur}
                            onPointerDown={(e) => e.stopPropagation()}
                            style={{ cursor: isEditing ? 'pointer' : 'default', transform: 'scale(1.1)' }}
                        />
                        
                        {isEditing ? (
                            <input
                                type="text"
                                defaultValue={t.text}
                                onBlur={(e) => {
                                    updateTodoText(t.id, e.target.value)
                                    handleBlur(e)
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{ 
                                    flexGrow: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent',
                                    textDecoration: t.checked ? 'line-through' : 'none',
                                    color: t.checked ? '#aaa' : '#333'
                                }}
                            />
                        ) : (
                            <span style={{ 
                                flexGrow: 1, fontSize: 15,
                                textDecoration: t.checked ? 'line-through' : 'none',
                                color: t.checked ? '#aaa' : '#333'
                            }}>
                                {t.text}
                            </span>
                        )}

                        {isEditing && (
                            <button
                                onClick={() => deleteTodo(t.id)}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 18 }}
                            >
                                &times;
                            </button>
                        )}
                    </div>
                ))}

                {/* 新增項目區域 */}
                {isEditing && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 8, borderTop: '1px solid #eee' }}>
                        <button 
                            onClick={addTodo} 
                            onPointerDown={(e) => e.stopPropagation()}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                        >
                            +
                        </button>
                        <input
                            type="text"
                            value={newText}
                            onChange={(e) => setNewText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }}
                            onPointerDown={(e) => e.stopPropagation()}
                            placeholder="新增項目..."
                            style={{ flexGrow: 1, border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 14 }}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}