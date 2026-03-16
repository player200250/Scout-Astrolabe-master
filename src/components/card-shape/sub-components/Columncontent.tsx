// ColumnContent.tsx
import { useRef } from 'react'
import { useEditor } from 'tldraw'
import type { TLCardShape } from '../type/CardShape'

interface ColumnContentProps {
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
}

export function ColumnContent({ shape, isEditing, exitEdit }: ColumnContentProps) {
    const editor = useEditor()
    const inputRef = useRef<HTMLInputElement>(null)
    const p = shape.props

    const saveTitle = (value: string) => {
        editor.updateShape({ id: shape.id, type: 'card', props: { text: value } })
        exitEdit()
    }

    return (
        <div
            style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                pointerEvents: isEditing ? 'auto' : 'none',
            }}
            onPointerDown={(e) => { if (isEditing) e.stopPropagation() }}
        >
            {/* 標題列 */}
            <div style={{
                padding: '10px 14px 8px',
                borderBottom: '2px solid rgba(0,0,0,0.08)',
                flexShrink: 0,
            }}>
                {isEditing ? (
                    <input
                        ref={inputRef}
                        autoFocus
                        defaultValue={p.text || ''}
                        onBlur={(e) => saveTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitle(e.currentTarget.value)
                            if (e.key === 'Escape') exitEdit()
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        placeholder="欄位標題..."
                        style={{
                            width: '100%', border: 'none', outline: 'none',
                            fontSize: 15, fontWeight: 700, background: 'transparent',
                            color: '#333',
                        }}
                    />
                ) : (
                    <div style={{
                        fontSize: 15, fontWeight: 700, color: '#333',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {p.text || '未命名欄位'}
                    </div>
                )}
            </div>

            {/* 欄位內容區（空白，卡片自己拖進來） */}
            <div style={{ flex: 1, padding: 8 }}>
                {!isEditing && !p.text && (
                    <div style={{
                        color: 'rgba(0,0,0,0.2)', fontSize: 12,
                        textAlign: 'center', paddingTop: 12,
                        pointerEvents: 'none',
                    }}>
                        雙擊設定標題
                    </div>
                )}
            </div>
        </div>
    )
}