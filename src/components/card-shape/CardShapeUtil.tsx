// CardShapeUtil.tsx

import { useState, useEffect, useCallback, useContext } from 'react'
import { createPortal } from 'react-dom'
import React from 'react'
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
            if (type === 'todo' || type === 'link' ) {
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
            } else if (type === 'text') {
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

        useEffect(() => {
            if (p.preview || showTextModal) document.addEventListener('keydown', handleEscape)
            return () => document.removeEventListener('keydown', handleEscape)
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
                            pointerEvents: shouldInnerDivCaptureEvents || p.type === 'image' ? 'auto' : 'none',
                            cursor: shouldInnerDivCaptureEvents ? 'default' : 'grab',
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

                {/* 文字卡片全螢幕編輯 Modal */}
                {showTextModal && p.type === 'text' && createPortal(
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0,
                            width: '100vw', height: '100vh',
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            zIndex: 99999, pointerEvents: 'auto',
                        }}
                        onClick={(e) => { e.stopPropagation(); setShowTextModal(false) }}
                        onPointerDown={(e) => e.stopPropagation()}
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
            return <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
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
        // case 'code':
        //     return <CodeContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
    }
}