import React, { useState } from 'react'
import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import type { CardStatusType, PriorityType } from '../type/CardShape'
import { T } from '../../../theme/tokens'

export interface CardPropsBarProps {
    editor: Editor
    shape: TLCardShape
    isDark?: boolean
}

export function CardPropsBar({ editor, shape, isDark = false }: CardPropsBarProps) {
    const p = shape.props
    const [tagInput, setTagInput] = useState('')
    const currentStatus = (p.cardStatus ?? 'none') as CardStatusType
    const currentPriority = (p.priority ?? 'none') as PriorityType
    const tags: string[] = p.tags ?? []

    const setStatus = (cardStatus: CardStatusType) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { cardStatus } })
    }
    const setPriority = (priority: PriorityType) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { priority } })
    }
    const addTag = () => {
        const t = tagInput.trim()
        if (!t || tags.includes(t)) { setTagInput(''); return }
        editor.updateShape({ id: shape.id, type: 'card', props: { tags: [...tags, t] } })
        setTagInput('')
    }
    const removeTag = (tag: string) =>
        editor.updateShape({ id: shape.id, type: 'card', props: { tags: tags.filter(t => t !== tag) } })

    const selectStyle: React.CSSProperties = {
        fontSize: 11,
        border: `1px solid ${T.borderLight}`,
        borderRadius: 4,
        padding: '2px 4px',
        background: T.bgPanel,
        color: isDark ? '#e2e8f0' : 'inherit',
        cursor: 'pointer',
    }

    return (
        <div
            onPointerDown={e => e.stopPropagation()}
            style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
                padding: '4px 8px', borderBottom: `1px solid ${T.borderLight}`,
                background: T.bgApp, flexShrink: 0, minHeight: 30,
            }}
        >
            {/*
                狀態／優先級是原生 <select>，而 **<option> 裡放不了 SVG**（瀏覽器只渲染
                文字節點）—— 所以這兩欄無法比照右鍵選單改用 <Icon>。日後想統一的話，
                要付的代價是把 select 換成自訂下拉，而這裡位於卡片內部、疊在 tldraw 的
                事件系統上（見 arch_three_event_systems），風險遠高於收益。

                折衷＝**拿掉 emoji、只留文字**。原本的 ⬜📋🔵✅ 與 —🟡🟠🔴 是純裝飾：
                「待辦／進行中／完成」「高／中/低」中文本身已經講完了，emoji 只多帶了
                一排各自為政的顏色。右鍵選單的批次設定才是有圖示的那個入口。
            */}
            <select value={currentStatus} onChange={e => setStatus(e.target.value as CardStatusType)}
                onPointerDown={e => e.stopPropagation()} style={selectStyle} title="卡片狀態"
            >
                <option value="none">狀態：無</option>
                <option value="todo">待辦</option>
                <option value="in-progress">進行中</option>
                <option value="done">完成</option>
            </select>

            <select value={currentPriority} onChange={e => setPriority(e.target.value as PriorityType)}
                onPointerDown={e => e.stopPropagation()} style={selectStyle} title="優先級"
            >
                <option value="none">優先級：無</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
            </select>

            <div style={{ width: 1, height: 14, background: '#e0e0e0', flexShrink: 0 }} />

            {tags.map(tag => (
                <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 1,
                    background: '#eff6ff', color: '#2563eb',
                    borderRadius: 10, padding: '1px 6px 1px 7px', fontSize: 10, fontWeight: 500,
                }}>
                    #{tag}
                    <button
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => removeTag(tag)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 12, color: '#93c5fd', lineHeight: 1 }}
                    >×</button>
                </span>
            ))}

            <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); addTag() }
                    if (e.key === 'Escape') setTagInput('')
                }}
                onPointerDown={e => e.stopPropagation()}
                placeholder="+ 標籤"
                style={{ border: 'none', outline: 'none', fontSize: 10, background: 'transparent', minWidth: 44, color: T.textMuted }}
            />
        </div>
    )
}
