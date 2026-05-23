import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { Z_MODAL } from '../../../constants'

interface ImageContentProps {
    editor: Editor
    shape: TLCardShape
}

const btnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    flexShrink: 0,
    backdropFilter: 'blur(2px)',
}

export function ImageContent({ editor, shape }: ImageContentProps) {
    const p = shape.props
    const [previewOpen, setPreviewOpen] = useState(false)

    const stop = (e: React.PointerEvent) => e.stopPropagation()

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!p.image) return
        const link = document.createElement('a')
        link.href = p.image
        link.download = 'image.jpg'
        link.click()
    }

    const handleOpenTab = (e: React.MouseEvent) => {
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
    }

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        editor.deleteShapes([shape.id])
    }

    const handleOpenPreview = (e: React.PointerEvent) => {
        e.stopPropagation()
        setPreviewOpen(true)
    }

    const handleClosePreview = (e: React.PointerEvent) => {
        e.stopPropagation()
        setPreviewOpen(false)
    }

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', pointerEvents: 'none' }}>
            <img
                src={p.image || ''}
                alt="Card Content"
                loading="lazy"
                draggable={false}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
            />
            <div style={{
                position: 'absolute',
                top: 6,
                right: 6,
                display: 'flex',
                gap: 4,
                pointerEvents: 'auto',
            }}>
                <button
                    title="全螢幕預覽"
                    style={btnStyle}
                    onPointerDown={handleOpenPreview}
                >⛶</button>
                <button
                    title="下載圖片"
                    style={btnStyle}
                    onPointerDown={stop}
                    onClick={handleDownload}
                >⬇</button>
                <button
                    title="在新視窗開啟"
                    style={btnStyle}
                    onPointerDown={stop}
                    onClick={handleOpenTab}
                >↗</button>
                <button
                    title="刪除卡片"
                    style={btnStyle}
                    onPointerDown={stop}
                    onClick={handleDelete}
                >✕</button>
            </div>

            {previewOpen && createPortal(
                <div
                    onPointerDown={handleClosePreview}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.85)',
                        zIndex: Z_MODAL,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out',
                    }}
                >
                    <img
                        src={p.image || ''}
                        alt="Preview"
                        draggable={false}
                        onPointerDown={e => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            objectFit: 'contain',
                            borderRadius: 8,
                            userSelect: 'none',
                            cursor: 'default',
                        }}
                    />
                </div>,
                document.body
            )}
        </div>
    )
}
