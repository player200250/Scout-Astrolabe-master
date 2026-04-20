// src/ContextMenu.tsx
import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { CARD_COLORS } from './components/card-shape/type/CardShape'
import type { CardColor } from './components/card-shape/type/CardShape'

interface MenuItem {
    label: string
    icon: string
    action: () => void
    danger?: boolean
    divider?: boolean
}

interface ContextMenuProps {
    x: number
    y: number
    items: MenuItem[]
    onClose: () => void
    showColorPicker?: boolean
    onColorPick?: (color: CardColor) => void
    currentColor?: CardColor
}

function ContextMenuUI({ x, y, items, onClose, showColorPicker, onColorPick, currentColor }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ x, y })

    useEffect(() => {
        if (!ref.current) return
        const { width, height } = ref.current.getBoundingClientRect()
        const newX = x + width > window.innerWidth ? x - width : x
        const newY = y + height > window.innerHeight ? y - height : y
        setPos({ x: newX, y: newY })
    }, [x, y])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        setTimeout(() => window.addEventListener('mousedown', handler), 0)
        window.addEventListener('keydown', escHandler)
        return () => {
            window.removeEventListener('mousedown', handler)
            window.removeEventListener('keydown', escHandler)
        }
    }, [onClose])

    return (
        <div
            ref={ref}
            style={{
                position: 'fixed', top: pos.y, left: pos.x,
                background: '#fff', borderRadius: 10,
                boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
                zIndex: 99999, minWidth: 180, padding: '4px 0',
                userSelect: 'none', pointerEvents: 'auto',
            }}
        >
            {/* 顏色選擇器 */}
            {showColorPicker && onColorPick && (
                <>
                    <div style={{ padding: '8px 14px 4px', fontSize: 11, color: '#999', fontWeight: 600, letterSpacing: '0.5px' }}>
                        卡片顏色
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 14px 8px' }}>
                        {(Object.entries(CARD_COLORS) as [CardColor, typeof CARD_COLORS[CardColor]][]).map(([key, val]) => (
                            <div
                                key={key}
                                title={val.label}
                                onClick={() => { onColorPick(key); onClose() }}
                                style={{
                                    width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                                    backgroundColor: key === 'none' ? '#f0f0f0' : val.accent,
                                    border: currentColor === key ? '2px solid #333' : '2px solid transparent',
                                    boxSizing: 'border-box',
                                    transition: 'transform 0.1s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                {key === 'none' && <span style={{ fontSize: 10, color: '#999' }}>✕</span>}
                            </div>
                        ))}
                    </div>
                    <div style={{ height: 1, background: '#f0f0f0', margin: '0 0 4px' }} />
                </>
            )}

            {items.map((item, idx) => (
                <div key={idx}>
                    {item.divider && idx > 0 && (
                        <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                    )}
                    <div
                        onClick={() => { item.action(); onClose() }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                            color: item.danger ? '#ff4d4f' : '#1a1a1a',
                            borderRadius: 6, margin: '0 4px', transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = item.danger ? '#fff1f0' : '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                        <span>{item.label}</span>
                    </div>
                </div>
            ))}
        </div>
    )
}

/* --------------------------------------------------------------- hook */
interface UseContextMenuOptions {
    editor: Editor | null
    createTextCard: (x?: number, y?: number) => void
    createTodoCard: (x?: number, y?: number) => void
    createLinkCard: (x?: number, y?: number) => void
    openImageInput: () => void
    isInboxBoard?: boolean
    onMoveCard?: (shapeId: string) => void
}

export function useContextMenu({
    editor,
    createTextCard,
    createTodoCard,
    createLinkCard,
    openImageInput,
    isInboxBoard,
    onMoveCard,
}: UseContextMenuOptions) {
    const [menu, setMenu] = useState<{
        x: number; y: number; items: MenuItem[]
        showColorPicker?: boolean
        onColorPick?: (color: CardColor) => void
        currentColor?: CardColor
    } | null>(null)

    useEffect(() => {
        if (!editor) return

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()

            const screenPoint = { x: e.clientX, y: e.clientY }
            const canvasPoint = editor.screenToPage(screenPoint)
            const hitShape = editor.getShapeAtPoint(canvasPoint)
            const isCard = hitShape?.type === 'card'

            if (isCard && hitShape) {
                const shape = hitShape as any
                const isLink = shape.props?.type === 'link'
                const currentColor: CardColor = shape.props?.color ?? 'none'

                const items: MenuItem[] = [
                    {
                        icon: '🔍',
                        label: '縮放至此卡片',
                        action: () => {
                            editor.select(hitShape.id)
                            editor.zoomToSelection({ animation: { duration: 300 } })
                        },
                    },
                    {
                        icon: '📋',
                        label: '複製卡片',
                        action: () => {
                            editor.select(hitShape.id)
                            editor.duplicateShapes([hitShape.id], { x: 20, y: 20 })
                        },
                    },
                ]

                if (isLink) {
                    items.push({
                        icon: '✏️',
                        label: '編輯連結',
                        divider: true,
                        action: () => {
                            editor.updateShape({
                                id: hitShape.id, type: 'card',
                                props: { state: 'editing', linkEmbedUrl: null },
                            })
                        },
                    })
                }

                if (isInboxBoard && onMoveCard) {
                    items.push({
                        icon: '📦',
                        label: '移到白板...',
                        divider: true,
                        action: () => onMoveCard(hitShape.id),
                    })
                }

                items.push({
                    icon: '🗑️',
                    label: '刪除卡片',
                    danger: true,
                    divider: !isInboxBoard && !isLink,
                    action: () => { editor.deleteShapes([hitShape.id]) },
                })

                setMenu({
                    x: e.clientX, y: e.clientY, items,
                    showColorPicker: true,
                    currentColor,
                    onColorPick: (color: CardColor) => {
                        editor.updateShape({
                            id: hitShape.id, type: 'card',
                            props: { color },
                        })
                    },
                })
            } else {
                const createAt = (fn: (x: number, y: number) => void) => {
                    fn(canvasPoint.x, canvasPoint.y)
                }

                setMenu({
                    x: e.clientX, y: e.clientY,
                    items: [
                        { icon: '📝', label: '新增文字卡片', action: () => createAt(createTextCard) },
                        { icon: '✅', label: '新增待辦清單', action: () => createAt(createTodoCard) },
                        { icon: '🔗', label: '新增連結卡片', action: () => createAt(createLinkCard) },
                        { icon: '🖼️', label: '新增圖片卡片', action: () => openImageInput() },
                    ],
                })
            }
        }

        const canvas = document.querySelector('.tl-canvas') as HTMLElement
        const target = canvas ?? window
        target.addEventListener('contextmenu', handleContextMenu as EventListener)
        return () => target.removeEventListener('contextmenu', handleContextMenu as EventListener)
    }, [editor, createTextCard, createTodoCard, createLinkCard, openImageInput, isInboxBoard, onMoveCard])

    const closeMenu = () => setMenu(null)

    const menuElement = menu ? (
        <ContextMenuUI
            x={menu.x} y={menu.y} items={menu.items}
            onClose={closeMenu}
            showColorPicker={menu.showColorPicker}
            onColorPick={menu.onColorPick}
            currentColor={menu.currentColor}
        />
    ) : null

    return { menuElement }
}