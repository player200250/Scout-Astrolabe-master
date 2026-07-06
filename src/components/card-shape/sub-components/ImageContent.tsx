import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { Z_MODAL } from '../../../constants'
import * as imageStore from '../../../platform/imageStore'

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

    // 有 storedName 走 astro-img:// protocol（省記憶體），否則 fallback 舊 base64
    const src = imageStore.getImageSrc(p)

    const stop = (e: React.PointerEvent) => e.stopPropagation()

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!src) return
        const link = document.createElement('a')
        if (p.storedName) {
            try {
                const res = await fetch(src)
                const blob = await res.blob()
                const objUrl = URL.createObjectURL(blob)
                link.href = objUrl
                link.download = p.storedName
                link.click()
                setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
                return
            } catch { /* fall through to direct src */ }
        }
        link.href = src
        link.download = 'image.jpg'
        link.click()
    }

    const handleOpenTab = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!src) return
        let blobUrl: string
        if (p.storedName) {
            try {
                const res = await fetch(src)
                const blob = await res.blob()
                blobUrl = URL.createObjectURL(blob)
            } catch { return }
        } else {
            const base64Data = src.split(',')[1]
            const mimeType = src.split(';')[0].split(':')[1]
            const byteCharacters = atob(base64Data)
            const byteArray = new Uint8Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i)
            }
            const blob = new Blob([byteArray], { type: mimeType })
            blobUrl = URL.createObjectURL(blob)
        }
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
                src={src}
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
                        src={src}
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
