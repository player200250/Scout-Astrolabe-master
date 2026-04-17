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
} from '@tldraw/editor'
import { useEditor } from 'tldraw'

import type { TLCardShape } from './type/CardShape'
export type { TLCardShape } from './type/CardShape'
import { CARD_COLORS } from './type/CardShape'
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
            blobUrl: null,
            todos: [],
            url: '',
            linkEmbedUrl: null,
            state: 'idle',
            preview: false,
            color: 'none',
            w: 240,
            h: 120,
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
            if (shape.props.image || shape.props.blobUrl) {
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
                        onPointerEnter={() => setIsHovered(true)}
                        onPointerLeave={() => setIsHovered(false)}
                        onPointerDown={(e) => {
                            if (shouldInnerDivCaptureEvents) e.stopPropagation()
                        }}
                        style={{
                            width: '100%', height: '100%',
                            overflow: 'hidden', display: 'flex', flexDirection: 'column',
                            borderRadius: 8,
                            border: isEditing ? '1px solid #333' : '1px solid #ebebeb',
                            padding: 0, boxSizing: 'border-box',
                            pointerEvents: shouldInnerDivCaptureEvents || p.type === 'image' || p.type === 'todo' || (p.type === 'text' && p.text?.includes('[[')) ? 'auto' : 'none',
                            cursor: shouldInnerDivCaptureEvents || (p.type === 'text' && p.text?.includes('[[')) ? 'default' : 'grab',
                            boxShadow: isHovered && !isEditing
                                ? '0 8px 20px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.08)'
                                : isEditing
                                    ? '0 0 0 2px #333'
                                    : '0 2px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)',
                            transition: 'box-shadow 0.15s ease-in-out, border-color 0.15s ease-in-out',
                            backgroundColor: p.color === 'dark' ? '#1a1a2e' : colorStyle.bg,
                        }}
                    >
                        {p.color && p.color !== 'none' && (
                            <div style={{
                                height: 4, width: '100%', flexShrink: 0,
                                backgroundColor: colorStyle.accent,
                                borderRadius: '8px 8px 0 0',
                            }} />
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
                            src={p.blobUrl || p.image || ''}
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
                                href={p.blobUrl || p.image || ''}
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
                                onClick={(e) => { e.stopPropagation(); window.open(p.blobUrl || p.image || '', '_blank') }}
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
                                background: 'white', borderRadius: 16,
                                boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
                                display: 'flex', flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
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
    const { forwardLinks, backlinks } = useContext(BacklinksContext)
    const [expanded, setExpanded] = useState(false)

    const cardName = extractCardName(htmlContent)
    const fwdLinks: string[] = forwardLinks.get(shapeId) ?? []
    const bkLinks: BacklinkEntry[] = cardName
        ? (backlinks.get(cardName.toLowerCase()) ?? [])
        : []

    const total = fwdLinks.length + bkLinks.length
    if (total === 0) return null

    return (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
            {/* 收合列 */}
            <div
                onPointerDown={e => { e.stopPropagation(); e.preventDefault(); setExpanded(v => !v) }}
                style={{
                    padding: '3px 12px 4px',
                    background: 'rgba(255,255,255,0.94)',
                    backdropFilter: 'blur(4px)',
                    borderTop: '1px solid #ebebeb',
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
                        background: 'white',
                        border: '1px solid #e8e8e8',
                        borderRadius: '8px 8px 0 0',
                        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
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
                                    onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
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
                                borderTop: fwdLinks.length > 0 ? '1px solid #f5f5f5' : 'none',
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
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f7f7f7')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div style={{
                                        color: '#1a1a1a', overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {entry.preview || '(無預覽)'}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
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
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                    {!isEditing && (
                        <BacklinksPanel shapeId={shape.id} htmlContent={p.text || ''} />
                    )}
                </div>
            )
        case 'image':
            return <ImageContent editor={editor} shape={shape} />
        case 'todo':
            return <TodoContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
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
                    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                        <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
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