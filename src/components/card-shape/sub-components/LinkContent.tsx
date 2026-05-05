import { useMemo, useCallback, useState } from 'react'
import { Editor } from 'tldraw'
import type { TLCardShape, TLCardProps } from '../type/CardShape'

interface LinkContentProps {
    editor: Editor
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
    getEmbedData: (url: string) => { embedUrl: string | null; isEmbeddable: boolean }
}

export const LinkContent = ({ editor, shape, isEditing, exitEdit, getEmbedData }: LinkContentProps) => {
    const p = shape.props

    // ✅ 所有 Hook 必須在最上面
    const [isHovered, setIsHovered] = useState(false)

    const displayHost = useMemo(() => {
        if (!p.url) return 'LINK'
        try {
            const url = new URL(p.url.startsWith('http') ? p.url : `https://${p.url}`)
            return url.hostname.replace('www.', '').toUpperCase()
        } catch {
            return p.url.replace(/^https?:\/\//, '').split('/')[0].toUpperCase()
        }
    }, [p.url])

    const updateLinkData = useCallback(async (inputUrl: string, isFinal: boolean = false) => {
        const { embedUrl, isEmbeddable } = getEmbedData(inputUrl)
        const targetW = isEmbeddable ? 800 : 450
        const targetH = isEmbeddable ? 520 : 300

        const updatePayload: Partial<TLCardProps> = {
            url: inputUrl,
            linkEmbedUrl: embedUrl,
            w: targetW,
            h: targetH,
            state: isFinal ? 'idle' : 'editing',
        }

        if (isFinal && inputUrl) {
            const api = window.electronAPI
            if (api?.getLinkPreview) {
                const metadata = await api.getLinkPreview(inputUrl)
                if (metadata) {
                    updatePayload.title = metadata.title
                    if (metadata.description != null) updatePayload.description = metadata.description
                    if (metadata.image != null) updatePayload.thumbnail = metadata.image
                }
            }
        }

        editor.updateShape<TLCardShape>({
            id: shape.id,
            type: 'card',
            props: updatePayload,
        })

        if (isFinal) exitEdit()
    }, [editor, shape.id, getEmbedData, exitEdit])

    const openLink = useCallback(() => {
        const rawUrl = p.url
        if (!rawUrl) return
        const formattedUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
        if (window.electronAPI?.openLink) {
            window.electronAPI.openLink(formattedUrl)
        } else {
            window.open(formattedUrl, '_blank', 'noopener,noreferrer')
        }
    }, [p.url])

    // --- 編輯模式：有 embed → 播放模式；無 embed → 編輯 URL ---
    if (isEditing && p.linkEmbedUrl) {
        // 影片播放模式：移除遮罩，讓 iframe 可以互動
        return (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <iframe
                    src={p.linkEmbedUrl}
                    style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'auto' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
                {/* 點擊空白處退出播放模式提示 */}
                <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: 'rgba(0,0,0,0.5)', color: 'white',
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    pointerEvents: 'auto', cursor: 'pointer', zIndex: 10,
                }}
                    onClick={(e) => { e.stopPropagation(); exitEdit() }}
                >
                    ✕ 退出播放
                </div>
            </div>
        )
    }

    if (isEditing) {
        return (
            <div
                style={{
                    width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                    padding: '24px', boxSizing: 'border-box', backgroundColor: '#fff'
                }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <input
                    autoFocus
                    value={p.url ?? ''}
                    onChange={(e) => updateLinkData(e.target.value, false)}
                    onBlur={(e) => updateLinkData(e.target.value, true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') updateLinkData(e.currentTarget.value, true)
                        if (e.key === 'Escape') exitEdit()
                    }}
                    placeholder="貼上網址或影片連結..."
                    style={{
                        width: '100%', padding: '16px', border: '2px solid #333', borderRadius: '12px',
                        outline: 'none', fontSize: '16px', fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                />
            </div>
        )
    }

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
                backgroundColor: '#ffffff', overflow: 'hidden',
                pointerEvents: 'none',
                userSelect: 'none',
                position: 'relative',
            }}
        >
            {/* 右上角永遠顯示的開啟連結按鈕 */}
            {p.url && (
                <div
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); openLink() }}
                    title="開啟連結"
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 28, height: 28,
                        background: isHovered ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
                        borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, cursor: 'pointer', zIndex: 100,
                        pointerEvents: 'auto',
                        transition: 'background 0.15s',
                        color: 'white',
                    }}
                >
                    ↗
                </div>
            )}

            {/* 上方視覺區域 */}
            <div style={{
                width: '100%',
                height: p.linkEmbedUrl ? '65%' : (p.image ? '55%' : '40%'),
                backgroundColor: '#f1f3f5',
                position: 'relative',
                borderBottom: '1px solid rgba(0,0,0,0.05)'
            }}>
                {p.linkEmbedUrl ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <iframe
                            src={p.linkEmbedUrl}
                            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: isEditing ? 'auto' : 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                        {/* 編輯模式（雙擊後）移除遮罩，讓影片可以操作 */}
                        {!isEditing && (
                            <div
                                style={{
                                    position: 'absolute', inset: 0,
                                    pointerEvents: 'auto',
                                    cursor: 'grab',
                                    zIndex: 1,
                                }}
                            />
                        )}
                        {/* 提示文字：非編輯模式時提示雙擊播放 */}
                        {!isEditing && (
                            <div style={{
                                position: 'absolute', bottom: 8, left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0,0,0,0.5)', color: 'white',
                                fontSize: 11, padding: '3px 8px', borderRadius: 4,
                                pointerEvents: 'none', whiteSpace: 'nowrap',
                                zIndex: 2,
                            }}>
                                雙擊播放 · 拖拽移動
                            </div>
                        )}
                    </div>
                ) : p.image ? (
                    <img
                        src={p.image}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        alt="preview"
                    />
                ) : (
                    <div style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
                    }}>
                        <span style={{ fontSize: '48px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }}>🌐</span>
                    </div>
                )}
            </div>

            {/* 下方資訊區域 */}
            <div style={{
                flex: 1, padding: '24px 28px',
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center', gap: '8px',
            }}>
                <div style={{
                    fontSize: '11px', color: '#007aff', fontWeight: 800,
                    letterSpacing: '1.2px', marginBottom: '2px', textTransform: 'uppercase'
                }}>
                    {displayHost}
                </div>
                <div style={{
                    fontWeight: '700', fontSize: '20px', color: '#1a1a1a', lineHeight: '1.25',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                    {p.title || '雙擊編輯連結'}
                </div>
                <div style={{
                    fontSize: '15px', color: '#666', lineHeight: '1.5',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                    {p.description || p.url || ''}
                </div>
            </div>
        </div>
    )
}