import { useState, useRef, useCallback } from 'react'
import { FrameShapeUtil, HTMLContainer, useEditor } from 'tldraw'
import { useIsDarkMode } from '@tldraw/editor'
import type { TLFrameShape } from '@tldraw/editor'

/* ─── 獨立 React function component，Hooks 在此呼叫合法 ─── */
// eslint-disable-next-line react-refresh/only-export-components
function CustomFrameComponent({ shape }: { shape: TLFrameShape }) {
    const editor = useEditor()
    const isDark = useIsDarkMode()
    const isEditing = editor.getEditingShapeId() === shape.id

    const borderColor = isDark ? '#334155' : '#d1d5db'
    const bgColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
    const titleColor = isDark ? '#e2e8f0' : '#374151'

    const [draft, setDraft] = useState(shape.props.name)
    const inputRef = useRef<HTMLInputElement>(null)

    const commitEdit = useCallback((value: string) => {
        editor.updateShape<TLFrameShape>({
            id: shape.id, type: 'frame',
            props: { name: value.trim() },
        })
        editor.setEditingShape(null)
    }, [editor, shape.id])

    // 同步外部 name 到 draft（非編輯時）
    if (!isEditing && draft !== shape.props.name) {
        setDraft(shape.props.name)
    }

    // 進入編輯時 focus
    if (isEditing && inputRef.current) {
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    }

    return (
        <HTMLContainer
            style={{
                overflow: 'visible',
                pointerEvents: 'none',
                width: shape.props.w,
                height: shape.props.h,
            }}
        >
            {/* 標題（外部上方） */}
            <div
                style={{
                    position: 'absolute',
                    top: -28,
                    left: 0,
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'auto',
                    userSelect: 'none',
                }}
                onPointerDown={e => e.stopPropagation()}
            >
                {isEditing ? (
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={e => commitEdit(e.target.value)}
                        onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Enter') commitEdit(draft)
                            if (e.key === 'Escape') {
                                setDraft(shape.props.name)
                                editor.setEditingShape(null)
                            }
                        }}
                        style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: titleColor,
                            background: 'transparent',
                            border: 'none',
                            borderBottom: `1px solid ${titleColor}`,
                            outline: 'none',
                            padding: '0 2px',
                            minWidth: 60,
                            width: Math.max(60, draft.length * 9 + 18),
                            maxWidth: 320,
                            lineHeight: '20px',
                        }}
                    />
                ) : (
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: titleColor,
                            lineHeight: '20px',
                            whiteSpace: 'nowrap',
                            maxWidth: 320,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {shape.props.name || 'Frame'}
                    </span>
                )}
            </div>

            {/* Frame 本體 */}
            <div
                style={{
                    width: shape.props.w,
                    height: shape.props.h,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 12,
                    backgroundColor: bgColor,
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                }}
            />
        </HTMLContainer>
    )
}

/* ─── ShapeUtil class：component() 委派給 function component ─── */
export class CustomFrameShapeUtil extends FrameShapeUtil {
    override component(shape: TLFrameShape) {
        return <CustomFrameComponent shape={shape} />
    }

    override indicator(shape: TLFrameShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />
    }
}
