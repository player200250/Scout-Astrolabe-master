// src/ContextMenu.tsx
import { useEffect, useRef, useState } from 'react'
import { CARD_COLORS, STICKY_COLORS, STICKY_COLOR_LIST } from './components/card-shape/type/CardShape'
import type { CardColor } from './components/card-shape/type/CardShape'
import { Z_CLICK_AWAY, Z_MODAL, Z_ABOVE_MODAL } from './constants'

export interface MenuItem {
    label: string
    icon: string
    action: () => void
    danger?: boolean
    divider?: boolean
    submenu?: MenuItem[]
}

interface ContextMenuProps {
    x: number
    y: number
    items: MenuItem[]
    onClose: () => void
    showColorPicker?: boolean
    onColorPick?: (color: CardColor) => void
    currentColor?: CardColor
    isDark?: boolean
    isSticky?: boolean
}

// ── ContextMenuUI ───────────────────────────────────────────────────────────

export function ContextMenuUI({ x, y, items, onClose, showColorPicker, onColorPick, currentColor, isDark, isSticky }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])
    const [pos, setPos] = useState({ x, y })
    const [activeSubIdx, setActiveSubIdx] = useState<number | null>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const bg = isDark ? '#1e293b' : '#fff'
    const textColor = isDark ? '#e2e8f0' : '#1a1a1a'
    const dividerColor = isDark ? '#334155' : '#f0f0f0'
    const hoverBg = isDark ? '#2d3748' : '#f5f5f5'
    const mutedColor = isDark ? '#64748b' : '#999'

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
        boxShadow: isDark
            ? '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)'
            : '0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
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
                                    ? (isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0')
                                    : hoverBg
                            }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                            <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{sub.icon}</span>
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
                                        backgroundColor: key === 'none' ? (isDark ? '#334155' : '#f0f0f0') : val.accent,
                                        border: currentColor === key ? `2px solid ${textColor}` : '2px solid transparent',
                                        boxSizing: 'border-box', transition: 'transform 0.1s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                >
                                    {key === 'none' && <span style={{ fontSize: 10, color: mutedColor }}>✕</span>}
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
                                    ? (isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0')
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
                            <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {item.submenu && <span style={{ opacity: 0.45, fontSize: 12 }}>›</span>}
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
    isDark: boolean
}

export function SaveTemplateModal({ defaultName, cardContent, onConfirm, onClose, isDark }: SaveTemplateModalProps) {
    const [name, setName] = useState(defaultName)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleConfirm = () => { if (name.trim()) onConfirm(name.trim(), cardContent) }

    const bg = isDark ? '#1e293b' : '#fff'
    const text = isDark ? '#e2e8f0' : '#1a1a1a'
    const border = isDark ? '1px solid #475569' : '1px solid #e0e0e0'

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: Z_ABOVE_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
            onMouseDown={onClose}
        >
            <div
                style={{ background: bg, borderRadius: 14, padding: '22px 26px', minWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ fontWeight: 600, fontSize: 15, color: text, marginBottom: 14 }}>⭐ 存為模板</div>
                <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose() }}
                    placeholder="模板名稱"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 13px', borderRadius: 9, fontSize: 14,
                        border, background: isDark ? '#0f172a' : '#f9f9f9',
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
    isDark: boolean
}

export function BatchAddTagModal({ count, onConfirm, onClose, isDark }: BatchAddTagModalProps) {
    const [tag, setTag] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 0)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleConfirm = () => { const t = tag.trim(); if (t) onConfirm(t) }

    const bg = isDark ? '#1e293b' : '#fff'
    const text = isDark ? '#e2e8f0' : '#1a1a1a'
    const border = isDark ? '1px solid #475569' : '1px solid #e0e0e0'

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: Z_ABOVE_MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
            onMouseDown={onClose}
        >
            <div
                style={{ background: bg, borderRadius: 14, padding: '22px 26px', minWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ fontWeight: 600, fontSize: 15, color: text, marginBottom: 14 }}>🏷 為 {count} 張卡片附加標籤</div>
                <input
                    ref={inputRef}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose() }}
                    placeholder="標籤名稱（附加，不覆蓋既有標籤）"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 13px', borderRadius: 9, fontSize: 14,
                        border, background: isDark ? '#0f172a' : '#f9f9f9',
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

