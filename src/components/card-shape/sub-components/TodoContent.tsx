// src/components/card-shape/sub-components/TodoContent.tsx
import React, { useState, useRef, useCallback } from 'react'
import { useEditor } from 'tldraw'
import type { TLCardShape, TodoItem } from '../type/CardShape'

// 常數定義
const ITEM_HEIGHT = 28
const CARD_MIN_HEIGHT = 120

const calculateNewHeight = (todosCount: number, editing: boolean) => {
    const BASE_PADDING = 80
    const listHeight = todosCount * ITEM_HEIGHT
    const addAreaHeight = editing ? 48 : 0
    return Math.max(CARD_MIN_HEIGHT, BASE_PADDING + listHeight + addAreaHeight)
}

// 到期日狀態計算
const getDueDateStatus = (dueDate: string | undefined): { label: string; color: string; bg: string } | null => {
    if (!dueDate) return null
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (dueDate < todayStr) return { label: '逾期', color: '#ff4d4f', bg: '#fff5f5' }
    if (dueDate === todayStr) return { label: '今天', color: '#e67e00', bg: '#fff7f0' }
    const diffMs = new Date(dueDate).getTime() - today.getTime()
    const diffDays = Math.ceil(diffMs / 86400000)
    if (diffDays <= 7) return { label: `${diffDays}天後`, color: '#3b82f6', bg: '#eff6ff' }
    const [, m, d] = dueDate.split('-')
    return { label: `${parseInt(m)}/${parseInt(d)}`, color: '#888', bg: '#f5f5f5' }
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
        requestAnimationFrame(() => containerRef.current?.focus())
    }, [todos, updateTodos])

    const updateTodoText = useCallback((todoId: string, text: string) => {
        const updated = todos.map(t => t.id === todoId ? { ...t, text } : t)
        editor.updateShape({ id, type: 'card', props: { todos: updated } })
    }, [editor, id, todos])

    const updateTodoDueDate = useCallback((todoId: string, dueDate: string | undefined) => {
        const updated = todos.map(t => t.id === todoId ? { ...t, dueDate: dueDate || undefined } : t)
        editor.updateShape({ id, type: 'card', props: { todos: updated } })
    }, [editor, id, todos])

    const updateTitle = useCallback((text: string) => {
        editor.updateShape({ id, type: 'card', props: { text } })
    }, [editor, id])

    const handleBlur = (e: React.FocusEvent) => {
        const nextFocus = e.relatedTarget as Node | null
        if (!containerRef.current?.contains(nextFocus)) {
            exitEdit()
            if (editor.getEditingShapeId() === id) {
                editor.setEditingShape(null)
            }
        }
    }

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
                {todos.map(t => {
                    const dueDateStatus = getDueDateStatus(t.dueDate)
                    return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: ITEM_HEIGHT }}>
                            <input
                                type="checkbox"
                                checked={t.checked}
                                onChange={() => toggle(t.id)}
                                onBlur={handleBlur}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{ cursor: isEditing ? 'pointer' : 'default', transform: 'scale(1.1)', flexShrink: 0 }}
                            />

                            {isEditing ? (
                                <>
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
                                            flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent',
                                            textDecoration: t.checked ? 'line-through' : 'none',
                                            color: t.checked ? '#aaa' : '#333',
                                            minWidth: 40,
                                        }}
                                    />
                                    {/* 日期選擇器 */}
                                    <input
                                        type="date"
                                        value={t.dueDate ?? ''}
                                        onChange={(e) => updateTodoDueDate(t.id, e.target.value || undefined)}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onBlur={handleBlur}
                                        title="設定截止日"
                                        style={{
                                            border: dueDateStatus ? `1px solid ${dueDateStatus.color}44` : '1px solid #e8e8e8',
                                            outline: 'none',
                                            fontSize: 11,
                                            color: dueDateStatus ? dueDateStatus.color : '#bbb',
                                            background: dueDateStatus ? dueDateStatus.bg : '#fafafa',
                                            borderRadius: 4,
                                            padding: '1px 3px',
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                            width: 108,
                                        }}
                                    />
                                    <button
                                        onClick={() => deleteTodo(t.id)}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 18, flexShrink: 0 }}
                                    >
                                        &times;
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span style={{
                                        flex: 1, fontSize: 15,
                                        textDecoration: t.checked ? 'line-through' : 'none',
                                        color: t.checked ? '#aaa' : '#333',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {t.text}
                                    </span>
                                    {/* 到期日 badge（未完成才顯示） */}
                                    {dueDateStatus && !t.checked && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 500,
                                            color: dueDateStatus.color,
                                            background: dueDateStatus.bg,
                                            borderRadius: 4,
                                            padding: '1px 5px',
                                            flexShrink: 0,
                                            border: `1px solid ${dueDateStatus.color}33`,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {dueDateStatus.label}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    )
                })}

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
