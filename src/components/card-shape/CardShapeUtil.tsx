// CardShapeUtil.tsx

import { useState, useEffect, useCallback, useContext } from 'react'
import { createPortal } from 'react-dom'
import React from 'react'
import { BacklinksContext, extractCardName, type BacklinkEntry } from '../../hooks/useBacklinks'
export { BacklinksContext } from '../../hooks/useBacklinks'
import {
    HTMLContainer,
    Rectangle2d,
    ShapeUtil,
    type Editor,
    useIsDarkMode,
} from '@tldraw/editor'
import { useEditor } from 'tldraw'

import type { TLCardShape } from './type/CardShape'
export type { TLCardShape } from './type/CardShape'
import { CARD_COLORS } from './type/CardShape'
import type { CardStatusType, PriorityType } from './type/CardShape'
import { resizeBox, type TLResizeInfo } from 'tldraw'

import { TextContent } from './sub-components/TextContent'
import { ImageContent } from './sub-components/ImageContent'
import { TodoContent } from './sub-components/TodoContent'
import { LinkContent } from './sub-components/LinkContent'
import { BoardContent } from './sub-components/Boardcontent'
// import { CodeContent } from './sub-components/CodeContent'

// Board 資料 context
interface BoardInfo { id: string; name: string; thumbnail: string | null }
export const BoardsContext = React.createContext<BoardInfo[]>([])

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

interface EmbedData {
    embedUrl: string | null;
    isEmbeddable: boolean;
    domain: string;
}

function getEmbedData(url: string): EmbedData {
    const trimmedUrl = url.trim();
    let domain = trimmedUrl;
    let embedUrl = null;
    let isEmbeddable = false;

    try {
        const fullUrl = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
        const urlObj = new URL(fullUrl);
        domain = urlObj.hostname.replace(/^www\./, '');

        if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            let videoId = '';
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.pathname.startsWith('/shorts/')) {
                    videoId = urlObj.pathname.replace('/shorts/', '').split('/')[0]
                } else {
                    videoId = new URLSearchParams(urlObj.search).get('v') || ''
                }
            } else if (urlObj.hostname.includes('youtu.be')) {
                videoId = urlObj.pathname.substring(1)
            }
            if (videoId) {
                embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&modestbranding=1&rel=0`;
                isEmbeddable = true;
                domain = 'YouTube';
            }
        } else if (domain.includes('bilibili.com')) {
            const bvMatch = urlObj.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)
            const avMatch = urlObj.pathname.match(/\/video\/av(\d+)/)
            if (bvMatch) {
                embedUrl = `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0`
                isEmbeddable = true
                domain = 'Bilibili'
            } else if (avMatch) {
                embedUrl = `https://player.bilibili.com/player.html?aid=${avMatch[1]}&autoplay=0`
                isEmbeddable = true
                domain = 'Bilibili'
            }
        } else if (domain.includes('vimeo.com')) {
            const match = urlObj.pathname.match(/\/(\d+)$/);
            if (match && match[1]) {
                embedUrl = `https://player.vimeo.com/video/${match[1]}`;
                isEmbeddable = true;
                domain = 'Vimeo';
            }
        }
    } catch (e) {
        domain = trimmedUrl;
    }

    return { embedUrl, isEmbeddable, domain };
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
            w: 240,
            h: 120,
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
            } else if (type === 'text' || type === 'journal') {
                window.dispatchEvent(new CustomEvent('text-card-edit', {
                    detail: { shapeId: shape.id }
                }))
                return { id: shape.id, type: shape.type }
            }
        }
        return
    }

    onPointerDown(_shape: TLCardShape, _event: any): void { return }

    override component(shape: TLCardShape) {
        const editor = useEditor()
        const isDark = useIsDarkMode()
        const p = shape.props

        const [isHovered, setIsHovered] = useState(false)
        const [showTextModal, setShowTextModal] = useState(false)

        const isEditing = editor.getEditingShapeId() === shape.id || p.state === 'editing'
        const shouldInnerDivCaptureEvents = isEditing
        const colorStyle = CARD_COLORS[p.color ?? 'none']

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
                            overflow: 'hidden', display: 'flex', flexDirection: 'column',
                            borderRadius: 12,
                            border: isEditing ? '1.5px solid #2563eb' : isDark ? '1px solid #475569' : '1px solid #e8e8e8',
                            padding: 0, boxSizing: 'border-box',
                            pointerEvents: shouldInnerDivCaptureEvents || p.type === 'image' || p.type === 'todo' || (p.type === 'text' && p.text?.includes('[[')) ? 'auto' : 'none',
                            cursor: shouldInnerDivCaptureEvents || p.type === 'image' || (p.type === 'text' && p.text?.includes('[[')) ? 'default' : 'grab',
                            boxShadow: isHovered && !isEditing
                                ? '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)'
                                : isEditing
                                    ? '0 0 0 3px rgba(37,99,235,0.18), 0 4px 20px rgba(37,99,235,0.10)'
                                    : '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                            transition: 'box-shadow 0.15s ease-in-out, border-color 0.15s ease-in-out',
                            backgroundColor: p.color === 'dark' ? '#1a1a2e' : colorStyle.bg,
                        }}
                    >
                        {p.color && p.color !== 'none' && (
                            <div style={{
                                height: 4, width: '100%', flexShrink: 0,
                                backgroundColor: colorStyle.accent,
                                borderRadius: '12px 12px 0 0',
                            }} />
                        )}
                        {/* 非編輯：status badge 左上角 */}
                        {!isEditing && p.cardStatus && p.cardStatus !== 'none' && STATUS_BADGE[p.cardStatus] && (
                            <div style={{
                                position: 'absolute',
                                top: p.color && p.color !== 'none' ? 9 : 5,
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
                        {!isEditing && p.priority && p.priority !== 'none' && PRIORITY_DOT[p.priority] && (
                            <div style={{
                                position: 'absolute',
                                top: p.color && p.color !== 'none' ? 11 : 7,
                                right: 8, zIndex: 5, pointerEvents: 'none',
                                width: 9, height: 9, borderRadius: '50%',
                                background: PRIORITY_DOT[p.priority],
                                boxShadow: `0 0 0 2px ${PRIORITY_DOT[p.priority]}44`,
                            }} />
                        )}
                        {/* 編輯模式：屬性列 */}
                        {isEditing && (p.type === 'text' || p.type === 'todo' || p.type === 'journal') && (
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
                        }}
                        onClick={(e) => { e.stopPropagation(); closePreview() }}
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
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div
                            style={{ marginTop: 16, display: 'flex', gap: 8, pointerEvents: 'auto' }}
                            onClick={(e) => e.stopPropagation()}
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
                                onClick={(e) => e.stopPropagation()}
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
                                onClick={(e) => { e.stopPropagation(); window.open(p.image || '', '_blank') }}
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
                                onClick={(e) => { e.stopPropagation(); closePreview() }}
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

/* --------------------------------------------------------------- BacklinksPanel */
interface BacklinksPanelProps {
    shapeId: string
    htmlContent: string
}

function BacklinksPanel({ shapeId, htmlContent }: BacklinksPanelProps) {
    const { forwardLinks, backlinks, currentBoardName } = useContext(BacklinksContext)
    const isDark = useIsDarkMode()
    const [expanded, setExpanded] = useState(false)

    const cardName = extractCardName(htmlContent)
    const fwdLinks: string[] = forwardLinks.get(shapeId) ?? []

    // 查卡片名稱對應的引用
    const cardBkLinks: BacklinkEntry[] = cardName
        ? (backlinks.get(cardName.toLowerCase()) ?? [])
        : []
    // 查白板名稱對應的引用（[[BoardName]] 語法指向整個白板）
    const boardBkLinks: BacklinkEntry[] = currentBoardName
        ? (backlinks.get(currentBoardName.toLowerCase()) ?? [])
        : []

    // 合併去重（避免同一個 shape 出現兩次）
    const seen = new Set<string>()
    const bkLinks: BacklinkEntry[] = []
    for (const entry of [...cardBkLinks, ...boardBkLinks]) {
        const key = `${entry.boardId}_${entry.shapeId}`
        if (!seen.has(key)) { seen.add(key); bkLinks.push(entry) }
    }

    const total = fwdLinks.length + bkLinks.length
    if (total === 0) return null

    return (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
            {/* 收合列 */}
            <div
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); setExpanded(v => !v) }}
                style={{
                    padding: '3px 12px 4px',
                    background: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.94)',
                    backdropFilter: 'blur(4px)',
                    borderTop: `1px solid ${isDark ? '#334155' : '#e8e8e8'}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
            >
                {fwdLinks.length > 0 && (
                    <span style={{ fontSize: 10, color: '#3b82f6' }}>→ {fwdLinks.length} 個連結</span>
                )}
                {bkLinks.length > 0 && (
                    <span style={{ fontSize: 10, color: '#888' }}>← {bkLinks.length} 個引用</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 9, color: '#ccc' }}>
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {/* 展開面板（向上彈出） */}
            {expanded && (
                <div
                    onPointerDown={e => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        bottom: '100%', left: 0, right: 0,
                        background: isDark ? '#1e293b' : 'white',
                        border: `1px solid ${isDark ? '#334155' : '#e8e8e8'}`,
                        borderRadius: '12px 12px 0 0',
                        boxShadow: isDark ? '0 -4px 20px rgba(0,0,0,0.4)' : '0 -4px 20px rgba(0,0,0,0.1)',
                        maxHeight: 220,
                        overflowY: 'auto',
                        zIndex: 20,
                    }}
                >
                    {/* 連結到（forward） */}
                    {fwdLinks.length > 0 && (
                        <>
                            <div style={{
                                padding: '5px 12px 3px',
                                fontSize: 10, fontWeight: 600, color: '#3b82f6',
                                letterSpacing: '0.3px',
                            }}>
                                → 連結到
                            </div>
                            {fwdLinks.map(name => (
                                <div
                                    key={name}
                                    onPointerDown={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        window.dispatchEvent(new CustomEvent('jump-to-card', {
                                            detail: { targetName: name }
                                        }))
                                        setExpanded(false)
                                    }}
                                    style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 6 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#1e3a5f' : '#eff6ff')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ fontSize: 13 }}>📋</span> {name}
                                </div>
                            ))}
                        </>
                    )}

                    {/* 被引用（backlinks） */}
                    {bkLinks.length > 0 && (
                        <>
                            <div style={{
                                padding: '5px 12px 3px',
                                fontSize: 10, fontWeight: 600, color: '#888',
                                letterSpacing: '0.3px',
                                borderTop: fwdLinks.length > 0 ? `1px solid ${isDark ? '#334155' : '#f5f5f5'}` : 'none',
                            }}>
                                ← 被引用
                            </div>
                            {bkLinks.map(entry => (
                                <div
                                    key={`${entry.boardId}_${entry.shapeId}`}
                                    onPointerDown={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        window.dispatchEvent(new CustomEvent('jump-to-card', {
                                            detail: {
                                                boardId: entry.boardId,
                                                shapeId: entry.shapeId,
                                                x: entry.x,
                                                y: entry.y,
                                            }
                                        }))
                                        setExpanded(false)
                                    }}
                                    style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#243447' : '#f7f7f7')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div style={{
                                        color: isDark ? '#e2e8f0' : '#1a1a1a', overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {entry.preview || '(無預覽)'}
                                    </div>
                                    <div style={{ fontSize: 10, color: isDark ? '#64748b' : '#bbb', marginTop: 2 }}>
                                        {entry.boardName}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

/* --------------------------------------------------------------- CardPropsBar */
interface CardPropsBarProps { editor: Editor; shape: TLCardShape; isDark?: boolean }

function CardPropsBar({ editor, shape, isDark = false }: CardPropsBarProps) {
    const p = shape.props
    const [tagInput, setTagInput] = useState('')
    const currentStatus = (p.cardStatus ?? 'none') as CardStatusType
    const currentPriority = (p.priority ?? 'none') as PriorityType
    const tags: string[] = p.tags ?? []

    const setStatus  = (cardStatus: CardStatusType) => {
        console.log('[CardPropsBar] setStatus', { shapeId: shape.id, cardStatus })
        editor.updateShape({ id: shape.id, type: 'card', props: { cardStatus } })
    }
    const setPriority = (priority: PriorityType) => {
        console.log('[CardPropsBar] setPriority', { shapeId: shape.id, priority })
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
        border: `1px solid ${isDark ? '#475569' : '#e0e0e0'}`,
        borderRadius: 4,
        padding: '2px 4px',
        background: isDark ? '#2d3748' : 'white',
        color: isDark ? '#e2e8f0' : 'inherit',
        cursor: 'pointer',
    }

    return (
        <div
            onPointerDown={e => e.stopPropagation()}
            style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
                padding: '4px 8px', borderBottom: `1px solid ${isDark ? '#334155' : '#f0f0f0'}`,
                background: isDark ? '#1a2035' : '#fafafa', flexShrink: 0, minHeight: 30,
            }}
        >
            <select value={currentStatus} onChange={e => setStatus(e.target.value as CardStatusType)}
                onPointerDown={e => e.stopPropagation()} style={selectStyle}
            >
                <option value="none">⬜ 無</option>
                <option value="todo">📋 待辦</option>
                <option value="in-progress">🔵 進行中</option>
                <option value="done">✅ 完成</option>
            </select>

            <select value={currentPriority} onChange={e => setPriority(e.target.value as PriorityType)}
                onPointerDown={e => e.stopPropagation()} style={selectStyle}
            >
                <option value="none">— 無</option>
                <option value="low">🟡 低</option>
                <option value="medium">🟠 中</option>
                <option value="high">🔴 高</option>
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
                style={{ border: 'none', outline: 'none', fontSize: 10, background: 'transparent', minWidth: 44, color: isDark ? '#64748b' : '#aaa' }}
            />
        </div>
    )
}

/* --------------------------------------------------------------- TagsDisplay */
function TagsDisplay({ tags }: { tags: string[] }) {
    if (!tags.length) return null
    return (
        <div style={{ padding: '3px 12px 5px', display: 'flex', flexWrap: 'wrap', gap: 3, flexShrink: 0 }}>
            {tags.map(tag => (
                <span key={tag} style={{
                    background: '#eff6ff', color: '#2563eb',
                    borderRadius: 8, padding: '1px 7px', fontSize: 10, fontWeight: 500,
                }}>
                    #{tag}
                </span>
            ))}
        </div>
    )
}

/* --------------------------------------------------------------- CardContent */
interface CardContentProps {
    editor: Editor
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
}

function CardContent({ editor, shape, isEditing, exitEdit }: CardContentProps) {
    const p = shape.props
    const boards = useContext(BoardsContext)

    switch (p.type) {
        case 'text':
            return (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                        <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                    </div>
                    {!isEditing && <TagsDisplay tags={p.tags ?? []} />}
                    {!isEditing && (
                        <BacklinksPanel shapeId={shape.id} htmlContent={p.text || ''} />
                    )}
                </div>
            )
        case 'image':
            return <ImageContent editor={editor} shape={shape} />
        case 'todo': {
            const todoTags = p.tags ?? []
            if (!isEditing && todoTags.length > 0) {
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                            <TodoContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                        </div>
                        <TagsDisplay tags={todoTags} />
                    </div>
                )
            }
            return <TodoContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
        }
        case 'link':
            return (
                <LinkContent
                    key={shape.id + p.w + p.h}
                    editor={editor}
                    shape={shape}
                    isEditing={isEditing}
                    exitEdit={exitEdit}
                    getEmbedData={getEmbedData}
                />
            )
        case 'board': {
            const linkedBoard = boards.find(b => b.id === p.linkedBoardId)
            return (
                <BoardContent
                    shape={shape}
                    boardName={linkedBoard?.name ?? p.text}
                    boardThumbnail={linkedBoard?.thumbnail ?? null}
                />
            )
        }
        case 'journal':
            return (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{
                        padding: '8px 14px',
                        background: '#dbeafe',
                        borderBottom: '2px solid #3b82f6',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#1d4ed8',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        📔 {(p as any).journalDate ?? '今日'}
                    </div>
                    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                            <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                        </div>
                        {!isEditing && <TagsDisplay tags={p.tags ?? []} />}
                        {!isEditing && (
                            <BacklinksPanel shapeId={shape.id} htmlContent={p.text || ''} />
                        )}
                    </div>
                </div>
            )
        // case 'code':
        //     return <CodeContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
    }
}