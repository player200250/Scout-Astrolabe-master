// src/ContextMenu.tsx
import { useEffect, useRef, useState } from 'react'
import { CARD_COLORS, STICKY_COLORS, STICKY_COLOR_LIST } from './components/card-shape/type/CardShape'
import type { CardColor } from './components/card-shape/type/CardShape'
import { Z_CLICK_AWAY, Z_MODAL, Z_ABOVE_MODAL } from './constants'
import { T } from './theme/tokens'
import { Icon } from './components/ui/icons'
import type { IconName } from './components/ui/icons'

export interface MenuItem {
    label: string
    /** `components/ui/icons.tsx` 的 registry key，不是 emoji。 */
    icon: IconName
    /**
     * 圖示色的唯一合法例外（icons.tsx 規則 1 是「一律 currentColor」）：
     * **選色用的項目**，顏色本身就是選項的內容（便利貼六色）。
     * 其餘任何「想讓這一列醒目一點」的理由都不算，用 `danger` 或標籤文字表達。
     */
    iconColor?: string
    action: () => void
    danger?: boolean
    divider?: boolean
    submenu?: MenuItem[]
}

/** 選單列左側 20px 的圖示欄；`color` 由外層列決定（danger 紅字時圖示也跟著紅）。 */
function MenuIcon({ item }: { item: MenuItem }) {
    return (
        <span style={{ width: 20, flexShrink: 0, display: 'flex', justifyContent: 'center', color: item.iconColor }}>
            <Icon name={item.icon} />
        </span>
    )
}

interface ContextMenuProps {
    x: number
    y: number
    items: MenuItem[]
    onClose: () => void
    showColorPicker?: boolean
    onColorPick?: (color: CardColor) => void
    currentColor?: CardColor
    isSticky?: boolean
}

// ── ContextMenuUI ───────────────────────────────────────────────────────────

export function ContextMenuUI({ x, y, items, onClose, showColorPicker, onColorPick, currentColor,  isSticky }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])
    const [pos, setPos] = useState({ x, y })
    const [activeSubIdx, setActiveSubIdx] = useState<number | null>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const bg = T.bgPanel
    const textColor = T.textPrimary
    const dividerColor = T.borderLight
    const hoverBg = T.bgHover
    const mutedColor = T.textMuted

    const cancelClose = () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null }
    }
    const scheduleClose = () => {
        cancelClose()
        closeTimerRef.current = setTimeout(() => setActiveSubIdx(null), 180)
    }

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

    useEffect(() => () => { cancelClose() }, [])

    const menuBoxStyle = {
        background: bg, borderRadius: 10,
        boxShadow: `${T.shadowPanel}, 0 0 0 1px ${T.ringSubtle}`,
        zIndex: Z_MODAL, minWidth: 180, padding: '4px 0',
        userSelect: 'none' as const, pointerEvents: 'auto' as const,
    }

    const renderSubmenu = () => {
        if (activeSubIdx === null) return null
        const parentItem = items[activeSubIdx]
        if (!parentItem?.submenu?.length) return null

        const parentEl = itemRefs.current[activeSubIdx]
        if (!parentEl) return null
        const rect = parentEl.getBoundingClientRect()

        const estimatedHeight = parentItem.submenu.length * 34 + 24
        let subLeft = rect.right + 4
        if (subLeft + 220 > window.innerWidth) subLeft = rect.left - 224
        let subTop = rect.top
        if (subTop + estimatedHeight > window.innerHeight) {
            subTop = Math.max(8, window.innerHeight - estimatedHeight - 8)
        }

        return (
            <div
                style={{ position: 'fixed', top: subTop, left: subLeft, ...menuBoxStyle, zIndex: 100000 }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
            >
                {parentItem.submenu.map((sub, si) => (
                    <div key={si}>
                        {sub.divider && si > 0 && (
                            <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />
                        )}
                        <div
                            onMouseDown={(e) => { e.stopPropagation(); sub.action(); onClose() }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                                color: sub.danger ? '#ff4d4f' : textColor,
                                borderRadius: 6, margin: '0 4px', transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => {
                                cancelClose()
                                e.currentTarget.style.background = sub.danger
                                    ? (T.dangerBgSoft)
                                    : hoverBg
                            }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                            <MenuIcon item={sub} />
                            <span>{sub.label}</span>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, zIndex: Z_CLICK_AWAY }}
                onMouseDown={onClose}
            />
            <div ref={ref} style={{ position: 'fixed', top: pos.y, left: pos.x, ...menuBoxStyle }}>
                {showColorPicker && onColorPick && !isSticky && (
                    <>
                        <div style={{ padding: '8px 14px 4px', fontSize: 11, color: mutedColor, fontWeight: 600, letterSpacing: '0.5px' }}>
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
                                        backgroundColor: key === 'none' ? (T.bgHover) : val.accent,
                                        border: currentColor === key ? `2px solid ${textColor}` : '2px solid transparent',
                                        boxSizing: 'border-box', transition: 'transform 0.1s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                >
                                    {key === 'none' && <span style={{ color: mutedColor, display: 'flex' }}><Icon name="close" /></span>}
                                </div>
                            ))}
                        </div>
                        <div style={{ height: 1, background: dividerColor, margin: '0 0 4px' }} />
                    </>
                )}
                {showColorPicker && onColorPick && isSticky && (
                    <>
                        <div style={{ padding: '8px 14px 4px', fontSize: 11, color: mutedColor, fontWeight: 600, letterSpacing: '0.5px' }}>
                            便利貼顏色
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 14px 8px' }}>
                            {STICKY_COLOR_LIST.map((key) => {
                                const val = STICKY_COLORS[key]
                                return (
                                    <div
                                        key={key}
                                        title={val.label}
                                        onClick={() => { onColorPick(key as CardColor); onClose() }}
                                        style={{
                                            width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                                            backgroundColor: val.bg,
                                            border: currentColor === key ? `2px solid ${textColor}` : '2px solid transparent',
                                            boxSizing: 'border-box', transition: 'transform 0.1s',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                    />
                                )
                            })}
                        </div>
                        <div style={{ height: 1, background: dividerColor, margin: '0 0 4px' }} />
                    </>
                )}

                {items.map((item, idx) => (
                    <div key={idx}>
                        {item.divider && idx > 0 && (
                            <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />
                        )}
                        <div
                            ref={el => { itemRefs.current[idx] = el }}
                            onClick={() => {
                                if (item.submenu) return
                                item.action()
                                onClose()
                            }}
                            onMouseEnter={e => {
                                cancelClose()
                                setActiveSubIdx(item.submenu ? idx : null)
                                e.currentTarget.style.background = item.danger
                                    ? (T.dangerBgSoft)
                                    : hoverBg
                            }}
                            onMouseLeave={e => {
                                if (item.submenu) scheduleClose()
                                e.currentTarget.style.background = 'transparent'
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                                color: item.danger ? '#ff4d4f' : textColor,
                                borderRadius: 6, margin: '0 4px', transition: 'background 0.1s',
                            }}
                        >
                            <MenuIcon item={item} />
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {item.submenu && (
                                <span style={{ opacity: 0.45, display: 'flex' }}><Icon name="chevronRight" /></span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {renderSubmenu()}
        </>
    )
}

// ── SaveTemplateModal ───────────────────────────────────────────────────────

export interface SaveTemplateModalProps {
    defaultName: string
    cardContent: string
    onConfirm: (name: string, content: string) => void
    onClose: () => void
}

export function SaveTemplateModal({ defaultName, cardContent, onConfirm, onClose }: SaveTemplateModalProps) {
    const [name, setName] = useState(defaultName)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleConfirm = () => { if (name.trim()) onConfirm(name.trim(), cardContent) }

    const bg = T.bgPanel
    const text = T.textPrimary
    const border = `1px solid ${T.borderLight}`

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: Z_ABOVE_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
            onMouseDown={onClose}
        >
            <div
                style={{ background: bg, borderRadius: 14, padding: '22px 26px', minWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15, color: text, marginBottom: 14 }}>
                    <Icon name="star" size="md" />存為模板
                </div>
                <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose() }}
                    placeholder="模板名稱"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 13px', borderRadius: 9, fontSize: 14,
                        border, background: T.bgApp,
                        color: text, outline: 'none',
                    }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '7px 18px', borderRadius: 8, border, background: 'transparent', color: text, cursor: 'pointer', fontSize: 13 }}
                    >取消</button>
                    <button
                        onClick={handleConfirm}
                        style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >確認</button>
                </div>
            </div>
        </div>
    )
}

// ── BatchAddTagModal ─────────────────────────────────────────────────────────

export interface BatchAddTagModalProps {
    count: number
    onConfirm: (tag: string) => void
    onClose: () => void
}

export function BatchAddTagModal({ count, onConfirm, onClose }: BatchAddTagModalProps) {
    const [tag, setTag] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 0)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleConfirm = () => { const t = tag.trim(); if (t) onConfirm(t) }

    const bg = T.bgPanel
    const text = T.textPrimary
    const border = `1px solid ${T.borderLight}`

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: Z_ABOVE_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
            onMouseDown={onClose}
        >
            <div
                style={{ background: bg, borderRadius: 14, padding: '22px 26px', minWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15, color: text, marginBottom: 14 }}>
                    <Icon name="tag" size="md" />為 {count} 張卡片附加標籤
                </div>
                <input
                    ref={inputRef}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose() }}
                    placeholder="標籤名稱（附加，不覆蓋既有標籤）"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 13px', borderRadius: 9, fontSize: 14,
                        border, background: T.bgApp,
                        color: text, outline: 'none',
                    }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '7px 18px', borderRadius: 8, border, background: 'transparent', color: text, cursor: 'pointer', fontSize: 13 }}
                    >取消</button>
                    <button
                        onClick={handleConfirm}
                        style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >附加</button>
                </div>
            </div>
        </div>
    )
}

