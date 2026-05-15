// CardShapeUtil.tsx

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
export { BacklinksContext } from '../../hooks/useBacklinks'
export { BoardsContext } from './BoardsContext'
import {
    HTMLContainer,
    Rectangle2d,
    ShapeUtil,
    useIsDarkMode,
} from '@tldraw/editor'
import { useEditor } from 'tldraw'

import type { TLCardShape } from './type/CardShape'
export type { TLCardShape } from './type/CardShape'
import { CARD_COLORS, STICKY_COLORS, STICKY_COLOR_LIST } from './type/CardShape'
import type { StickyColor } from './type/CardShape'
import { resizeBox, type TLResizeInfo } from 'tldraw'

function toStickyColor(color: string): StickyColor {
    return STICKY_COLOR_LIST.includes(color as StickyColor) ? (color as StickyColor) : 'yellow'
}

import { TextContent } from './sub-components/TextContent'
import { CardContent } from './sub-components/CardContent'
import { CardPropsBar } from './sub-components/CardPropsBar'

/* ----------------------------------------------------------------- 卡片屬性常數 */
const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    'todo':        { label: '📋 待辦',  color: '#555',    bg: '#f0f0f0' },
    'in-progress': { label: '🔵 進行中', color: '#2563eb', bg: '#dbeafe' },
    'done':        { label: '✅ 完成',   color: '#16a34a', bg: '#dcfce7' },
}

const PRIORITY_DOT: Record<string, string> = {
    low:    '#facc15',
    medium: '#fb923c',
    high:   '#ef4444',
}

export class CardShapeUtil extends ShapeUtil<TLCardShape> {
    static override type = 'card' as const

    override canEdit() { return true }

    override getDefaultProps(): TLCardShape['props'] {
        return {
            type: 'text',
            text: 'New Note',
            image: null,
            todos: [],
            url: '',
            linkEmbedUrl: null,
            state: 'idle',
            preview: false,
            color: 'none',
            w: 280,
            h: 320,
            tags: [],
            cardStatus: 'none',
            priority: 'none',
        }
    }

    override getGeometry(shape: TLCardShape) {
        return new Rectangle2d({
            x: 0, y: 0,
            width: shape.props.w,
            height: shape.props.h,
            isFilled: true,
        })
    }

    override hideSelectionBoundsBg() { return true }
    override hideRotateHandle() { return true }
    override hideResizeHandles() { return false }

    override onResize(shape: TLCardShape, info: TLResizeInfo<TLCardShape>) {
        return resizeBox(shape, info)
    }

    override indicator(shape: TLCardShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />
    }

    onDoubleClick(shape: TLCardShape) {
        const type = shape.props.type

        if (type === 'group') {
            return { id: shape.id, type: shape.type }
        }

        if (type === 'image') {
            if (shape.props.image) {
                this.editor.updateShape({
                    id: shape.id, type: 'card',
                    props: { preview: true },
                })
            }
            return { id: shape.id, type: shape.type }
        } else if (shape.props.state === 'idle') {
            if (type === 'todo' || type === 'link') {
                this.editor.updateShape({
                    id: shape.id, type: 'card',
                    props: { state: 'editing' },
                })
                return { id: shape.id, type: shape.type }
            } else if (type === 'board') {
                window.dispatchEvent(new CustomEvent('board-card-enter', {
                    detail: { linkedBoardId: shape.props.linkedBoardId }
                }))
                return { id: shape.id, type: shape.type }
            } else if (type === 'heading' || type === 'sticky') {
                this.editor.updateShape({
                    id: shape.id, type: 'card',
                    props: { state: 'editing' },
                })
                return { id: shape.id, type: shape.type }
            } else if (type === 'table') {
                // Table cells handle their own inline editing
                return { id: shape.id, type: shape.type }
            } else if (type === 'color') {
                // Color swatches handle their own inline editing
                return { id: shape.id, type: shape.type }
            } else if (type === 'file') {
                if (shape.props.storedName) {
                    window.electronAPI?.openFile(shape.props.storedName)
                }
                return { id: shape.id, type: shape.type }
            } else if (type === 'text' || type === 'journal') {
                window.dispatchEvent(new CustomEvent('text-card-edit', {
                    detail: { shapeId: shape.id }
                }))
                return { id: shape.id, type: shape.type }
            }
        }
        return
    }

    onPointerDown(): void { return }

    override component(shape: TLCardShape) {
        const editor = useEditor()
        const isDark = useIsDarkMode()
        const p = shape.props

        const [isHovered, setIsHovered] = useState(false)
        const [showTextModal, setShowTextModal] = useState(false)

        const isEditing = editor.getEditingShapeId() === shape.id || p.state === 'editing'
        const shouldInnerDivCaptureEvents = isEditing
        const colorStyle = CARD_COLORS[p.color ?? 'none']
        const isSticky = p.type === 'sticky'
        const isGroup = p.type === 'group'
        const stickyStyle = isSticky ? STICKY_COLORS[toStickyColor(p.color)] : null

        const groupAccent = (isGroup && p.color && p.color !== 'none') ? CARD_COLORS[p.color].accent : null
        const groupBorder = groupAccent
            ? `1.5px solid ${groupAccent}`
            : isDark ? '1.5px solid #334155' : '1.5px solid #d1d5db'
        const groupBg = (() => {
            if (!isGroup) return undefined
            if (groupAccent) {
                const r = parseInt(groupAccent.slice(1, 3), 16)
                const g = parseInt(groupAccent.slice(3, 5), 16)
                const b = parseInt(groupAccent.slice(5, 7), 16)
                return `rgba(${r},${g},${b},0.08)`
            }
            return isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
        })()

        const exitEdit = () => {
            editor.updateShape({
                id: shape.id, type: 'card',
                props: { state: 'idle' },
            })
        }

        const closePreview = useCallback(() => {
            if (p.preview) {
                editor.updateShape({
                    id: shape.id, type: 'card',
                    props: { preview: false },
                })
            }
        }, [editor, shape.id, p.preview])

        useEffect(() => {
            const handler = (e: Event) => {
                const detail = (e as CustomEvent).detail
                if (detail?.shapeId === shape.id) {
                    editor.selectNone()
                    setShowTextModal(true)
                }
            }
            window.addEventListener('text-card-edit', handler)
            return () => window.removeEventListener('text-card-edit', handler)
        }, [shape.id])

        const handleEscape = useCallback((e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closePreview()
                setShowTextModal(false)
            }
        }, [closePreview])

        // 用 capture: true 確保比 tiptap 更早拿到 ESC 事件
        useEffect(() => {
            if (p.preview || showTextModal) {
                document.addEventListener('keydown', handleEscape, true)
            }
            return () => document.removeEventListener('keydown', handleEscape, true)
        }, [p.preview, showTextModal, handleEscape])

        return (
            <>
                <HTMLContainer
                    className="card-main-container"
                    data-state={isEditing ? 'editing' : 'idle'}
                    onPointerDown={(e) => {
                        if (isEditing) e.stopPropagation()
                    }}
                    style={{
                        width: p.w, height: p.h,
                        display: 'flex', flexDirection: 'column',
                        pointerEvents: 'all',
                        overflow: 'visible',
                    }}
                >
                    <div
                        className={p.color === 'dark' ? 'card-dark-bg' : undefined}
                        onPointerEnter={() => setIsHovered(true)}
                        onPointerLeave={() => setIsHovered(false)}
                        onPointerDown={(e) => {
                            if (shouldInnerDivCaptureEvents) e.stopPropagation()
                        }}
                        style={{
                            width: '100%', height: '100%',
                            position: 'relative',
                            overflow: isGroup ? 'visible' : 'hidden',
                            display: 'flex', flexDirection: 'column',
                            borderRadius: 12,
                            border: isGroup ? groupBorder : (p.type === 'heading' || isSticky) ? 'none' : isEditing ? '1.5px solid #2563eb' : isDark ? '1px solid #334155' : '1px solid #f0f0f0',
                            padding: 0, boxSizing: 'border-box',
                            pointerEvents: isGroup || shouldInnerDivCaptureEvents || p.type === 'image' || p.type === 'todo' || p.type === 'table' || p.type === 'color' || p.type === 'file' || (p.type === 'text' && p.text?.includes('[[')) ? 'auto' : 'none',
                            cursor: isGroup ? 'grab' : shouldInnerDivCaptureEvents || p.type === 'image' || p.type === 'todo' || p.type === 'table' || p.type === 'color' || p.type === 'file' || (p.type === 'text' && p.text?.includes('[[')) ? 'default' : 'grab',
                            boxShadow: isGroup ? 'none' : p.type === 'heading' ? 'none' : isSticky
                                ? isEditing
                                    ? '0 0 0 2px rgba(37,99,235,0.35), 0 2px 8px rgba(0,0,0,0.15)'
                                    : '0 2px 8px rgba(0,0,0,0.15)'
                                : isEditing
                                    ? '0 0 0 3px rgba(37,99,235,0.18), 0 4px 20px rgba(37,99,235,0.10)'
                                    : isHovered
                                        ? isDark ? '0 2px 8px rgba(0,0,0,0.30)' : '0 2px 8px rgba(0,0,0,0.08)'
                                        : 'none',
                            transition: 'box-shadow 0.15s ease-in-out, border-color 0.15s ease-in-out',
                            backgroundColor: isGroup ? groupBg : p.type === 'heading' ? 'transparent' : isSticky ? (isDark ? stickyStyle!.darkBg : stickyStyle!.bg) : p.color === 'dark' ? '#1a1a2e' : (!p.color || p.color === 'none') ? (isDark ? '#1e293b' : '#ffffff') : colorStyle.bg,
                        }}
                    >
                        {p.color && p.color !== 'none' && p.type !== 'image' && !isSticky && !isGroup && (
                            <div style={{
                                height: 3, width: '100%', flexShrink: 0,
                                backgroundColor: colorStyle.accent,
                                borderRadius: '12px 12px 0 0',
                            }} />
                        )}
                        {/* 非編輯：status badge 左上角 */}
                        {p.type !== 'heading' && !isSticky && !isGroup && !isEditing && p.cardStatus && p.cardStatus !== 'none' && STATUS_BADGE[p.cardStatus] && (
                            <div style={{
                                position: 'absolute',
                                top: p.color && p.color !== 'none' ? 8 : 5,
                                left: 8, zIndex: 5, pointerEvents: 'none',
                                fontSize: 10, fontWeight: 600,
                                color: STATUS_BADGE[p.cardStatus].color,
                                background: STATUS_BADGE[p.cardStatus].bg,
                                borderRadius: 5, padding: '1px 6px',
                            }}>
                                {STATUS_BADGE[p.cardStatus].label}
                            </div>
                        )}
                        {/* 非編輯：priority 圓點右上角 */}
                        {p.type !== 'heading' && !isSticky && !isGroup && !isEditing && p.priority && p.priority !== 'none' && PRIORITY_DOT[p.priority] && (
                            <div style={{
                                position: 'absolute',
                                top: p.color && p.color !== 'none' ? 10 : 7,
                                right: 8, zIndex: 5, pointerEvents: 'none',
                                width: 9, height: 9, borderRadius: '50%',
                                background: PRIORITY_DOT[p.priority],
                                boxShadow: `0 0 0 2px ${PRIORITY_DOT[p.priority]}44`,
                            }} />
                        )}
                        {/* 編輯模式：屬性列 */}
                        {isEditing && !isSticky && !isGroup && (p.type === 'text' || p.type === 'todo' || p.type === 'journal') && (
                            <CardPropsBar editor={editor} shape={shape} isDark={isDark} />
                        )}
                        <CardContent
                            editor={editor}
                            shape={shape}
                            isEditing={isEditing}
                            exitEdit={exitEdit}
                        />
                    </div>
                </HTMLContainer>

                {/* 全螢幕圖片預覽 */}
                {p.preview && p.type === 'image' && createPortal(
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0,
                            width: '100vw', height: '100vh',
                            backgroundColor: 'rgba(0,0,0,0.92)',
                            display: 'flex', flexDirection: 'column',
                            justifyContent: 'center', alignItems: 'center',
                            zIndex: 99999, cursor: 'zoom-out',
                            pointerEvents: 'auto',
                        }}
                        onPointerDown={(e) => {
                            if (e.target === e.currentTarget) {
                                e.stopPropagation()
                                closePreview()
                            }
                        }}
                    >
                        <img
                            src={p.image || ''}
                            alt="Preview"
                            style={{
                                maxWidth: '95vw', maxHeight: '88vh',
                                objectFit: 'contain', borderRadius: 4,
                                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                                cursor: 'default',
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                        <div
                            style={{ marginTop: 16, display: 'flex', gap: 8, pointerEvents: 'auto', zIndex: 100000 }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <a
                                href={p.image || ''}
                                download="image"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.15)', color: 'white',
                                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                    textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)',
                                    backdropFilter: 'blur(8px)',
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                ⬇ 下載
                            </a>
                            <button
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.15)', color: 'white',
                                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    backdropFilter: 'blur(8px)',
                                }}
                                onPointerDown={(e) => {
                                    e.stopPropagation()
                                    if (!p.image) return
                                    const base64Data = p.image.split(',')[1]
                                    const mimeType = p.image.split(';')[0].split(':')[1]
                                    const byteCharacters = atob(base64Data)
                                    const byteArray = new Uint8Array(byteCharacters.length)
                                    for (let i = 0; i < byteCharacters.length; i++) {
                                        byteArray[i] = byteCharacters.charCodeAt(i)
                                    }
                                    const blob = new Blob([byteArray], { type: mimeType })
                                    const blobUrl = URL.createObjectURL(blob)
                                    if (window.electronAPI?.openExternal) {
                                        window.electronAPI.openExternal(blobUrl)
                                    } else {
                                        window.open(blobUrl, '_blank')
                                    }
                                }}
                            >
                                🔗 新分頁
                            </button>
                            <button
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(8px)',
                                }}
                                onPointerDown={(e) => { e.stopPropagation(); closePreview() }}
                            >
                                ✕ 關閉
                            </button>
                        </div>
                        <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                            點擊背景或按 ESC 關閉
                        </div>
                    </div>,
                    document.body
                )}

                {/* 文字卡片 / Journal 卡片全螢幕編輯 Modal */}
                {showTextModal && (p.type === 'text' || p.type === 'journal') && createPortal(
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0,
                            width: '100vw', height: '100vh',
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            zIndex: 99999, pointerEvents: 'auto',
                        }}
                        onPointerDown={(e) => {
                            // 只有點到背景本身（不是 modal 內容）才關閉
                            if (e.target === e.currentTarget) {
                                e.stopPropagation()
                                setShowTextModal(false)
                            }
                        }}
                    >
                        <div
                            style={{
                                width: '680px', maxWidth: '90vw', maxHeight: '80vh',
                                background: isDark ? '#1e293b' : 'white', borderRadius: 16,
                                boxShadow: isDark ? '0 24px 60px rgba(0,0,0,0.5)' : '0 24px 60px rgba(0,0,0,0.2)',
                                display: 'flex', flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <CardPropsBar editor={editor} shape={shape} isDark={isDark} />
                            <TextContent
                                editor={editor}
                                shape={shape}
                                isEditing={true}
                                exitEdit={() => setShowTextModal(false)}
                                preventResize={true}
                            />
                        </div>
                    </div>,
                    document.body
                )}
            </>
        )
    }
}

