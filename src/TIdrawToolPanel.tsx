import { useState, useRef, useEffect, type ReactNode } from "react"
import { useEditor, DefaultColorStyle, DefaultSizeStyle } from "tldraw"
import type { TLDefaultColorStyle, TLDefaultSizeStyle } from "tldraw"
import { GeoShapeGeoStyle } from "@tldraw/tlschema"
import type { TLGeoShapeGeoStyle } from "@tldraw/tlschema"
import type { TLCardShape } from "./components/card-shape/type/CardShape"

/* ─── Style constants ─── */
const DRAW_COLORS: { id: TLDefaultColorStyle; css: string; label: string }[] = [
    { id: 'black',  css: '#1d1d1d', label: '黑' },
    { id: 'white',  css: '#f0f0f0', label: '白' },
    { id: 'red',    css: '#e03131', label: '紅' },
    { id: 'orange', css: '#f76707', label: '橙' },
    { id: 'yellow', css: '#f59f00', label: '黃' },
    { id: 'green',  css: '#2f9e44', label: '綠' },
    { id: 'blue',   css: '#1971c2', label: '藍' },
    { id: 'violet', css: '#7048e8', label: '紫' },
]

const SIZE_OPTIONS: { id: TLDefaultSizeStyle; label: string }[] = [
    { id: 's',  label: 'S' },
    { id: 'm',  label: 'M' },
    { id: 'l',  label: 'L' },
    { id: 'xl', label: 'XL' },
]

/* ─── SVG icon library ─── */
// All icons: 16×16 rendered, 18×18 viewBox, currentColor, strokeWidth 1.5
const IcoSelect = (
    <svg width="16" height="16" viewBox="0 0 18 18">
        <path d="M4 2L4 14L7.5 11L9.5 15.5L11 14.8L9 10.2L13.5 10.2Z" fill="currentColor"/>
    </svg>
)
const IcoHand = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 10V6a1.2 1.2 0 012.4 0v4"/>
        <path d="M9.4 9V5.5a1.2 1.2 0 012.4 0V10"/>
        <path d="M11.8 9V7a1.2 1.2 0 012.4 0v3.5c0 3-1.6 5.5-5 5.5s-5-2.5-5-5.5V10a1.2 1.2 0 012.4 0"/>
    </svg>
)
const IcoDraw = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 14.5l1.5-4L13 3l2 2-8 8.5-3.5 1z"/>
        <path d="M13 3l2 2"/>
    </svg>
)
const IcoHighlight = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15.5h10"/>
        <path d="M4.5 10.5L9 5l4 4-4.5 5.5H5.5z"/>
        <path d="M9 5l4 4"/>
    </svg>
)
const IcoEraser = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 15.5h12"/>
        <path d="M6.5 15.5L3.5 12 9 6.5l5 5-3.5 4H6.5z"/>
        <path d="M3.5 12l3 3.5"/>
    </svg>
)
const IcoLine = (
    <svg width="16" height="16" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3.5" y1="14.5" x2="14.5" y2="3.5"/>
    </svg>
)
const IcoRect = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4.5" width="12" height="9" rx="1.5"/>
    </svg>
)
const IcoCircle = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="9" cy="9" r="6"/>
    </svg>
)
const IcoTriangle = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M9 2.5L16.5 15.5H1.5Z"/>
    </svg>
)
const IcoArrow = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14L14 4M14 4H9M14 4v5"/>
    </svg>
)
const IcoTextCard = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 5h12M3 8.5h9M3 12h10M3 15.5h6"/>
    </svg>
)
const IcoImageCard = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="14" height="12" rx="1.5"/>
        <circle cx="6" cy="7" r="1.4" fill="currentColor" stroke="none"/>
        <path d="M2 12l4-3.5 3 3 2-2 5 4.5"/>
    </svg>
)
const IcoTodoCard = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5.5l1.5 1.5L7 4"/>
        <path d="M9.5 5.5h5"/>
        <path d="M3 9.5l1.5 1.5L7 8"/>
        <path d="M9.5 9.5h4"/>
        <path d="M3 13.5l1.5 1.5L7 12"/>
        <path d="M9.5 13.5h3.5"/>
    </svg>
)
const IcoLinkCard = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 8a3.5 3.5 0 015 5l-1.5 1.5a3.5 3.5 0 01-5-5"/>
        <path d="M8 10a3.5 3.5 0 01-5-5L4.5 3.5a3.5 3.5 0 015 5"/>
        <line x1="7" y1="11" x2="11" y2="7"/>
    </svg>
)
const IcoBoardCard = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="2" y="2" width="14" height="14" rx="2"/>
        <path d="M2 7.5h14M7.5 7.5v8.5"/>
    </svg>
)
const IcoColumnCard = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="2" y="3" width="5.5" height="12" rx="1.5"/>
        <rect x="10.5" y="3" width="5.5" height="12" rx="1.5"/>
    </svg>
)
const IcoAlign = (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 5h12M5 9h8M4 13h10"/>
    </svg>
)

/* drag ghost chars (text-only, shown during HTML drag) */
const DRAG_GHOST: Record<string, string> = {
    text: 'T', todo: '✓', link: '⌘', image: '⬜', board: '⊞', column: '▥',
}

/* ─── Types ─── */
export interface CardCreators {
    createTextCard: () => void
    createImageCard: (imgBase64: string) => void
    createTodoCard: () => void
    createLinkCard: () => void
    createBoardCard: () => void
    createColumnCard: () => void
    openImageInput: () => void
    isDark?: boolean
}

/* ─── Shared tooltip ─── */
function Tooltip({ label }: { label: string }) {
    return (
        <div style={{
            position: 'absolute', left: 44, top: '50%', transform: 'translateY(-50%)',
            background: '#1a1a1a', color: 'white', fontSize: 12,
            padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 99999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
            {label}
            <div style={{
                position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)',
                width: 0, height: 0,
                borderTop: '4px solid transparent', borderBottom: '4px solid transparent',
                borderRight: '4px solid #1a1a1a',
            }} />
        </div>
    )
}

/* ================================================
   可拖曳的卡片建立按鈕
================================================ */
function DraggableCardButton({
    icon, label, cardType, onClick,
    onDragStart: onDragStartCb, onDragEnd: onDragEndCb,
    isDark, btnHover,
}: {
    icon: ReactNode
    label: string
    cardType: 'text' | 'todo' | 'link' | 'image' | 'board' | 'column'
    onClick: () => void
    onDragStart?: () => void
    onDragEnd?: () => void
    isDark?: boolean
    btnHover?: string
}) {
    const [hovered, setHovered] = useState(false)
    const [dragging, setDragging] = useState(false)
    const hBg = btnHover ?? '#f0f0f0'

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                draggable
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onDragStart={(e) => {
                    setDragging(true)
                    onDragStartCb?.()
                    e.dataTransfer.setData('cardType', cardType)
                    e.dataTransfer.effectAllowed = 'copy'
                    const ghost = document.createElement('div')
                    ghost.textContent = DRAG_GHOST[cardType] ?? cardType[0].toUpperCase()
                    ghost.style.cssText = 'position:fixed;top:-100px;font-size:22px;background:white;border-radius:8px;padding:6px 10px;box-shadow:0 4px 12px rgba(0,0,0,0.15)'
                    document.body.appendChild(ghost)
                    e.dataTransfer.setDragImage(ghost, 20, 20)
                    setTimeout(() => document.body.removeChild(ghost), 0)
                }}
                onDragEnd={() => { setDragging(false); onDragEndCb?.() }}
                style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    background: dragging
                        ? (isDark ? 'rgba(37,99,235,0.25)' : '#e8f0fe')
                        : hovered ? hBg : 'transparent',
                    cursor: 'grab',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isDark ? '#94a3b8' : '#888',
                    transition: 'background 0.12s, color 0.12s',
                    padding: 0, opacity: dragging ? 0.5 : 1,
                }}
            >
                {icon}
            </button>
            {hovered && !dragging && <Tooltip label={label} />}
        </div>
    )
}

/* ================================================
   一般工具按鈕
================================================ */
function SidebarButton({
    icon, label, onClick, isActive, isDark,
    btnHover, btnActive, btnColor, btnActiveColor,
}: {
    icon: ReactNode
    label: string
    onClick: () => void
    isActive?: boolean
    isDark?: boolean
    btnHover?: string
    btnActive?: string
    btnColor?: string
    btnActiveColor?: string
}) {
    const [hovered, setHovered] = useState(false)
    const hBg   = btnHover      ?? '#f0f0f0'
    const aBg   = btnActive     ?? '#e8f0fe'
    const color = btnColor      ?? '#888'
    const aColor = btnActiveColor ?? '#2563eb'

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    background: isActive ? aBg : hovered ? hBg : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? aColor : hovered ? (isDark ? '#e2e8f0' : '#444') : color,
                    transition: 'background 0.12s, color 0.12s',
                    padding: 0,
                }}
            >
                {icon}
            </button>
            {hovered && <Tooltip label={label} />}
        </div>
    )
}

/* ================================================
   對齊子選單
================================================ */
function AlignSubmenu({ onAlign, isDark, alignMenuBg, alignMenuBorder, btnHover }: {
    onAlign: (dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void
    isDark?: boolean
    alignMenuBg?: string
    alignMenuBorder?: string
    btnHover?: string
}) {
    const [hovered, setHovered] = useState(false)
    const [open, setOpen] = useState(false)
    const hBg = btnHover ?? '#f0f0f0'
    const menuBg = alignMenuBg ?? 'white'
    const menuBorder = alignMenuBorder ?? '#eee'

    const alignButtons = [
        { dir: 'left'   as const, icon: '⇤', label: '靠左對齊' },
        { dir: 'center' as const, icon: '↔', label: '水平置中' },
        { dir: 'right'  as const, icon: '⇥', label: '靠右對齊' },
        { dir: 'top'    as const, icon: '⇡', label: '靠上對齊' },
        { dir: 'middle' as const, icon: '↕', label: '垂直置中' },
        { dir: 'bottom' as const, icon: '⇣', label: '靠下對齊' },
    ]

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(o => !o)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    background: open
                        ? (isDark ? 'rgba(37,99,235,0.3)' : '#e8f0fe')
                        : hovered ? hBg : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: open
                        ? (isDark ? '#93c5fd' : '#2563eb')
                        : hovered ? (isDark ? '#e2e8f0' : '#444') : (isDark ? '#94a3b8' : '#888'),
                    transition: 'background 0.12s, color 0.12s', padding: 0,
                }}
            >
                {IcoAlign}
            </button>

            {hovered && !open && <Tooltip label="對齊工具" />}

            {open && (
                <div style={{
                    position: 'absolute', left: 44, top: 0,
                    background: menuBg, borderRadius: 10,
                    boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
                    border: `1px solid ${menuBorder}`, padding: 6,
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 4, zIndex: 99999,
                }}>
                    {alignButtons.map(btn => (
                        <button
                            key={btn.dir}
                            onClick={() => { onAlign(btn.dir); setOpen(false) }}
                            title={btn.label}
                            style={{
                                width: 32, height: 32, borderRadius: 6, border: 'none',
                                background: 'transparent', cursor: 'pointer', fontSize: 16,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: isDark ? '#e2e8f0' : '#444',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = hBg)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >{btn.icon}</button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ================================================
   筆刷按鈕（含顏色 + 大小面板）
================================================ */
function DrawButton({
    isOpen, onToggle, drawColor, drawSize, onColorChange, onSizeChange,
    isActive, isDark, btnHover, btnActive, btnColor, btnActiveColor,
}: {
    isOpen: boolean
    onToggle: () => void
    drawColor: TLDefaultColorStyle
    drawSize: TLDefaultSizeStyle
    onColorChange: (c: TLDefaultColorStyle) => void
    onSizeChange: (s: TLDefaultSizeStyle) => void
    isActive: boolean
    isDark?: boolean
    btnHover?: string
    btnActive?: string
    btnColor?: string
    btnActiveColor?: string
}) {
    const [hovered, setHovered] = useState(false)
    const hBg  = btnHover      ?? '#f0f0f0'
    const aBg  = btnActive     ?? '#e8f0fe'
    const col  = btnColor      ?? '#888'
    const aCol = btnActiveColor ?? '#2563eb'
    const panelBg     = isDark ? '#1e293b' : '#ffffff'
    const panelBorder = isDark ? '#334155' : '#e5e7eb'
    const dotCss = DRAW_COLORS.find(c => c.id === drawColor)?.css ?? '#1d1d1d'
    const showActive = isActive || isOpen

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                onClick={onToggle}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    background: showActive ? aBg : hovered ? hBg : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: showActive ? aCol : hovered ? (isDark ? '#e2e8f0' : '#444') : col,
                    transition: 'background 0.12s, color 0.12s',
                    padding: 0, position: 'relative',
                }}
            >
                {IcoDraw}
                {/* 目前顏色小圓點 */}
                <div style={{
                    position: 'absolute', bottom: 4, right: 4,
                    width: 6, height: 6, borderRadius: '50%',
                    background: dotCss,
                    border: `1.5px solid ${isDark ? '#1e293b' : 'white'}`,
                    pointerEvents: 'none',
                }} />
            </button>

            {hovered && !isOpen && <Tooltip label="筆刷工具" />}

            {isOpen && (
                <div style={{
                    position: 'absolute', left: 44, top: 0,
                    background: panelBg, borderRadius: 12,
                    boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.15)',
                    border: `1px solid ${panelBorder}`,
                    padding: '10px 12px', zIndex: 99999, minWidth: 184,
                }}>
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#9ca3af', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em' }}>顏色</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                        {DRAW_COLORS.map(c => (
                            <button
                                key={c.id}
                                title={c.label}
                                onClick={() => onColorChange(c.id)}
                                style={{
                                    width: 28, height: 28, borderRadius: 6,
                                    background: c.css, cursor: 'pointer', padding: 0,
                                    border: drawColor === c.id
                                        ? `2.5px solid ${isDark ? '#93c5fd' : '#2563eb'}`
                                        : '2px solid transparent',
                                    outline: 'none', transition: 'transform 0.1s',
                                    boxShadow: c.id === 'white' ? `inset 0 0 0 1px ${isDark ? '#475569' : '#d1d5db'}` : 'none',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)' }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                            />
                        ))}
                    </div>
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#9ca3af', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em' }}>大小</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {SIZE_OPTIONS.map(s => (
                            <button
                                key={s.id}
                                onClick={() => onSizeChange(s.id)}
                                style={{
                                    flex: 1, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                                    background: drawSize === s.id
                                        ? (isDark ? 'rgba(37,99,235,0.35)' : '#dbeafe')
                                        : (isDark ? '#2d3748' : '#f3f4f6'),
                                    fontSize: 11, fontWeight: 700,
                                    color: drawSize === s.id
                                        ? (isDark ? '#93c5fd' : '#2563eb')
                                        : (isDark ? '#94a3b8' : '#6b7280'),
                                    transition: 'background 0.1s, color 0.1s',
                                }}
                            >{s.label}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

/* ================================================
   橡皮擦按鈕（含大小面板）
================================================ */
function EraserButton({
    isOpen, onToggle, eraserSize, onSizeChange,
    isActive, isDark, btnHover, btnActive, btnColor, btnActiveColor,
}: {
    isOpen: boolean
    onToggle: () => void
    eraserSize: TLDefaultSizeStyle
    onSizeChange: (s: TLDefaultSizeStyle) => void
    isActive: boolean
    isDark?: boolean
    btnHover?: string
    btnActive?: string
    btnColor?: string
    btnActiveColor?: string
}) {
    const [hovered, setHovered] = useState(false)
    const hBg  = btnHover      ?? '#f0f0f0'
    const aBg  = btnActive     ?? '#e8f0fe'
    const col  = btnColor      ?? '#888'
    const aCol = btnActiveColor ?? '#2563eb'
    const panelBg     = isDark ? '#1e293b' : '#ffffff'
    const panelBorder = isDark ? '#334155' : '#e5e7eb'
    const showActive = isActive || isOpen

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                onClick={onToggle}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    background: showActive ? aBg : hovered ? hBg : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: showActive ? aCol : hovered ? (isDark ? '#e2e8f0' : '#444') : col,
                    transition: 'background 0.12s, color 0.12s', padding: 0,
                }}
            >
                {IcoEraser}
                {isOpen && (
                    <div style={{
                        position: 'absolute', bottom: 4, right: 4,
                        width: 5, height: 5, borderRadius: '50%',
                        background: aCol,
                        border: `1.5px solid ${isDark ? '#1e293b' : 'white'}`,
                        pointerEvents: 'none',
                    }} />
                )}
            </button>

            {hovered && !isOpen && <Tooltip label="橡皮擦" />}

            {isOpen && (
                <div style={{
                    position: 'absolute', left: 44, top: 0,
                    background: panelBg, borderRadius: 12,
                    boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.15)',
                    border: `1px solid ${panelBorder}`,
                    padding: '10px 12px', zIndex: 99999, minWidth: 152,
                }}>
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#9ca3af', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em' }}>大小</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {SIZE_OPTIONS.map(s => (
                            <button
                                key={s.id}
                                onClick={() => onSizeChange(s.id)}
                                style={{
                                    flex: 1, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                                    background: eraserSize === s.id
                                        ? (isDark ? 'rgba(37,99,235,0.35)' : '#dbeafe')
                                        : (isDark ? '#2d3748' : '#f3f4f6'),
                                    fontSize: 11, fontWeight: 700,
                                    color: eraserSize === s.id
                                        ? (isDark ? '#93c5fd' : '#2563eb')
                                        : (isDark ? '#94a3b8' : '#6b7280'),
                                    transition: 'background 0.1s, color 0.1s',
                                }}
                            >{s.label}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

/* ================================================
   螢光筆按鈕（含大小面板）
================================================ */
function HighlightButton({
    isOpen, onToggle, highlightSize, onSizeChange,
    isActive, isDark, btnHover, btnActive, btnColor, btnActiveColor,
}: {
    isOpen: boolean
    onToggle: () => void
    highlightSize: TLDefaultSizeStyle
    onSizeChange: (s: TLDefaultSizeStyle) => void
    isActive: boolean
    isDark?: boolean
    btnHover?: string
    btnActive?: string
    btnColor?: string
    btnActiveColor?: string
}) {
    const [hovered, setHovered] = useState(false)
    const hBg  = btnHover      ?? '#f0f0f0'
    const aBg  = btnActive     ?? '#e8f0fe'
    const col  = btnColor      ?? '#888'
    const aCol = btnActiveColor ?? '#2563eb'
    const panelBg     = isDark ? '#1e293b' : '#ffffff'
    const panelBorder = isDark ? '#334155' : '#e5e7eb'
    const showActive = isActive || isOpen

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                onClick={onToggle}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    background: showActive ? aBg : hovered ? hBg : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: showActive ? aCol : hovered ? (isDark ? '#e2e8f0' : '#444') : col,
                    transition: 'background 0.12s, color 0.12s', padding: 0,
                }}
            >
                {IcoHighlight}
                {isOpen && (
                    <div style={{
                        position: 'absolute', bottom: 4, right: 4,
                        width: 5, height: 5, borderRadius: '50%',
                        background: aCol,
                        border: `1.5px solid ${isDark ? '#1e293b' : 'white'}`,
                        pointerEvents: 'none',
                    }} />
                )}
            </button>

            {hovered && !isOpen && <Tooltip label="螢光筆" />}

            {isOpen && (
                <div style={{
                    position: 'absolute', left: 44, top: 0,
                    background: panelBg, borderRadius: 12,
                    boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.15)',
                    border: `1px solid ${panelBorder}`,
                    padding: '10px 12px', zIndex: 99999, minWidth: 152,
                }}>
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#9ca3af', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em' }}>大小</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {SIZE_OPTIONS.map(s => (
                            <button
                                key={s.id}
                                onClick={() => onSizeChange(s.id)}
                                style={{
                                    flex: 1, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                                    background: highlightSize === s.id
                                        ? (isDark ? 'rgba(37,99,235,0.35)' : '#dbeafe')
                                        : (isDark ? '#2d3748' : '#f3f4f6'),
                                    fontSize: 11, fontWeight: 700,
                                    color: highlightSize === s.id
                                        ? (isDark ? '#93c5fd' : '#2563eb')
                                        : (isDark ? '#94a3b8' : '#6b7280'),
                                    transition: 'background 0.1s, color 0.1s',
                                }}
                            >{s.label}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

/* ================================================
   主組件
================================================ */
export default function TldrawToolPanel({
    createTextCard, createTodoCard, createLinkCard,
    createBoardCard, createColumnCard, openImageInput, isDark,
}: CardCreators) {
    const editor = useEditor()
    const currentTool = editor.getCurrentToolId()
    const setTool = (tool: string) => editor.setCurrentTool(tool)
    const draggingCardType = useRef<string | null>(null)
    const toolbarRef = useRef<HTMLDivElement>(null)

    /* ── 面板狀態 ── */
    const [openPanel, setOpenPanel]           = useState<'draw' | 'eraser' | 'highlight' | null>(null)
    const [drawColor, setDrawColor]           = useState<TLDefaultColorStyle>('black')
    const [drawSize, setDrawSize]             = useState<TLDefaultSizeStyle>('m')
    const [eraserSize, setEraserSize]         = useState<TLDefaultSizeStyle>('m')
    const [highlightSize, setHighlightSize]   = useState<TLDefaultSizeStyle>('m')
    const [activeGeo, setActiveGeo]           = useState<TLGeoShapeGeoStyle>('rectangle')

    /* ── 工具列外點擊關閉面板 ── */
    useEffect(() => {
        if (!openPanel) return
        const handler = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node))
                setOpenPanel(null)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [openPanel])

    /* ── 筆刷 handlers ── */
    const handleDrawToggle = () => {
        if (openPanel === 'draw') { setOpenPanel(null); return }
        setTool('draw')
        editor.setStyleForNextShapes(DefaultColorStyle, drawColor)
        editor.setStyleForNextShapes(DefaultSizeStyle, drawSize)
        setOpenPanel('draw')
    }
    const handleColorChange = (color: TLDefaultColorStyle) => {
        setDrawColor(color)
        editor.setStyleForNextShapes(DefaultColorStyle, color)
    }
    const handleDrawSizeChange = (size: TLDefaultSizeStyle) => {
        setDrawSize(size)
        editor.setStyleForNextShapes(DefaultSizeStyle, size)
    }

    /* ── 螢光筆 handlers ── */
    const handleHighlightToggle = () => {
        if (openPanel === 'highlight') { setOpenPanel(null); return }
        setTool('highlight')
        editor.setStyleForNextShapes(DefaultSizeStyle, highlightSize)
        setOpenPanel('highlight')
    }
    const handleHighlightSizeChange = (size: TLDefaultSizeStyle) => {
        setHighlightSize(size)
        editor.setStyleForNextShapes(DefaultSizeStyle, size)
    }

    /* ── 橡皮擦 handlers ── */
    const handleEraserToggle = () => {
        if (openPanel === 'eraser') { setOpenPanel(null); return }
        setTool('eraser')
        editor.setStyleForNextShapes(DefaultSizeStyle, eraserSize)
        setOpenPanel('eraser')
    }
    const handleEraserSizeChange = (size: TLDefaultSizeStyle) => {
        setEraserSize(size)
        editor.setStyleForNextShapes(DefaultSizeStyle, size)
    }

    /* ── Geo 形狀 handler ── */
    const setGeoTool = (geo: TLGeoShapeGeoStyle) => {
        setActiveGeo(geo)
        editor.setCurrentTool('geo')
        editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
        setOpenPanel(null)
    }

    /* ── 拖曳放下 ── */
    useEffect(() => {
        const handleDragEnd = (e: DragEvent) => {
            if (!draggingCardType.current) return
            handleCardDrop(draggingCardType.current, e.clientX, e.clientY)
            draggingCardType.current = null
        }
        document.addEventListener('dragend', handleDragEnd)
        return () => document.removeEventListener('dragend', handleDragEnd)
    }, [editor])

    const handleCardDrop = (cardType: string, clientX: number, clientY: number) => {
        const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
        const defaultProps: Record<string, Record<string, unknown>> = {
            text:  { type: 'text',  text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 240, h: 160 },
            todo:  { type: 'todo',  text: '', image: null, todos: [{ id: `todo_${Date.now()}`, text: '新任務', checked: false }], url: null, linkEmbedUrl: null, state: 'idle', color: 'none', w: 260, h: 200 },
            link:  { type: 'link',  text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 260, h: 120 },
            image: { type: 'image', text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 300, h: 200 },
        }
        if (cardType === 'image') { openImageInput(); return }
        if (cardType === 'board') { createBoardCard(); return }
        if (cardType === 'column') {
            const pp = editor.screenToPage({ x: clientX, y: clientY })
            editor.createShape({ type: 'frame', x: pp.x - 160, y: pp.y - 240, props: { w: 320, h: 480, name: '欄位' } })
            return
        }
        editor.createShape({ type: 'card', x: pagePoint.x - 120, y: pagePoint.y - 80, props: defaultProps[cardType] })
    }

    /* ── 對齊 ── */
    const alignSelected = (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const shapes = editor.getSelectedShapes()
        if (shapes.length < 2) return
        const xs = shapes.map(s => s.x)
        const ys = shapes.map(s => s.y)
        const minX = Math.min(...xs), maxX = Math.max(...xs), avgX = xs.reduce((a, b) => a + b, 0) / xs.length
        const minY = Math.min(...ys), maxY = Math.max(...ys), avgY = ys.reduce((a, b) => a + b, 0) / ys.length
        const updates = shapes.map(s => {
            const cardProps = s.type === 'card' ? (s as unknown as TLCardShape).props : null
            const w = cardProps?.w ?? 0, h = cardProps?.h ?? 0
            let x = s.x, y = s.y
            if (direction === 'left')   x = minX
            else if (direction === 'right')  x = maxX - w
            else if (direction === 'center') x = avgX - w / 2
            else if (direction === 'top')    y = minY
            else if (direction === 'bottom') y = maxY - h
            else if (direction === 'middle') y = avgY - h / 2
            return { id: s.id, type: s.type, x, y }
        })
        editor.updateShapes(updates)
    }

    /* ── Theme tokens ── */
    const panelBg      = isDark ? 'rgba(30,41,59,0.97)' : 'rgba(255,255,255,0.97)'
    const panelBorder  = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)'
    const dividerColor = isDark ? '#1e293b' : '#ebebeb'
    const btnHover     = isDark ? '#2d3748' : '#f0f0f0'
    const btnActive    = isDark ? 'rgba(37,99,235,0.3)' : '#e8f0fe'
    const btnColor     = isDark ? '#94a3b8' : '#888'
    const btnActiveColor  = isDark ? '#93c5fd' : '#2563eb'
    const alignMenuBg     = isDark ? '#1e293b' : 'white'
    const alignMenuBorder = isDark ? '#334155' : '#e8e8e8'

    const shared = { isDark, btnHover, btnActive, btnColor, btnActiveColor }

    return (
        <>
            <div
                ref={toolbarRef}
                style={{
                    position: 'absolute', top: 12, left: 12,
                    display: 'flex', flexDirection: 'column', gap: 2,
                    background: panelBg,
                    backdropFilter: 'blur(12px)',
                    borderRadius: 12,
                    padding: '12px 6px',
                    width: 48,
                    boxSizing: 'border-box',
                    boxShadow: isDark
                        ? '0 4px 24px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3)'
                        : '0 4px 20px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.05)',
                    border: panelBorder,
                    pointerEvents: 'auto', zIndex: 9999,
                }}
                onDragOver={(e) => e.preventDefault()}
            >
                {/* ── 卡片工具組 ── */}
                <DraggableCardButton icon={IcoTextCard}   label="文字卡片（拖曳或點擊）" cardType="text"   onClick={createTextCard}   isDark={isDark} btnHover={btnHover} onDragStart={() => { draggingCardType.current = 'text' }}   onDragEnd={() => {}} />
                <DraggableCardButton icon={IcoImageCard}  label="圖片卡片（拖曳或點擊）" cardType="image"  onClick={openImageInput}   isDark={isDark} btnHover={btnHover} onDragStart={() => { draggingCardType.current = 'image' }}  onDragEnd={() => {}} />
                <DraggableCardButton icon={IcoTodoCard}   label="待辦卡片（拖曳或點擊）" cardType="todo"   onClick={createTodoCard}   isDark={isDark} btnHover={btnHover} onDragStart={() => { draggingCardType.current = 'todo' }}   onDragEnd={() => {}} />
                <DraggableCardButton icon={IcoLinkCard}   label="連結卡片（拖曳或點擊）" cardType="link"   onClick={createLinkCard}   isDark={isDark} btnHover={btnHover} onDragStart={() => { draggingCardType.current = 'link' }}   onDragEnd={() => {}} />
                <DraggableCardButton icon={IcoBoardCard}  label="子白板（拖曳或點擊）"   cardType="board"  onClick={createBoardCard}  isDark={isDark} btnHover={btnHover} onDragStart={() => { draggingCardType.current = 'board' }}  onDragEnd={() => {}} />
                <DraggableCardButton icon={IcoColumnCard} label="欄位分組（拖曳或點擊）" cardType="column" onClick={createColumnCard} isDark={isDark} btnHover={btnHover} onDragStart={() => { draggingCardType.current = 'column' }} onDragEnd={() => {}} />

                <div style={{ height: 1, background: dividerColor, margin: '6px 0' }} />

                {/* ── 繪圖工具組 ── */}
                <SidebarButton icon={IcoSelect} label="選取"    onClick={() => { setTool('select'); setOpenPanel(null) }} isActive={currentTool === 'select'} {...shared} />
                <SidebarButton icon={IcoHand}   label="手（平移）" onClick={() => { setTool('hand');   setOpenPanel(null) }} isActive={currentTool === 'hand'}   {...shared} />

                <DrawButton
                    isOpen={openPanel === 'draw'} onToggle={handleDrawToggle}
                    drawColor={drawColor} drawSize={drawSize}
                    onColorChange={handleColorChange} onSizeChange={handleDrawSizeChange}
                    isActive={currentTool === 'draw'} {...shared}
                />
                <HighlightButton
                    isOpen={openPanel === 'highlight'} onToggle={handleHighlightToggle}
                    highlightSize={highlightSize} onSizeChange={handleHighlightSizeChange}
                    isActive={currentTool === 'highlight'} {...shared}
                />
                <EraserButton
                    isOpen={openPanel === 'eraser'} onToggle={handleEraserToggle}
                    eraserSize={eraserSize} onSizeChange={handleEraserSizeChange}
                    isActive={currentTool === 'eraser'} {...shared}
                />

                <SidebarButton icon={IcoLine}     label="直線"   onClick={() => { setTool('line');  setOpenPanel(null) }} isActive={currentTool === 'line'}                              {...shared} />
                <SidebarButton icon={IcoRect}     label="矩形"   onClick={() => setGeoTool('rectangle')}                  isActive={currentTool === 'geo' && activeGeo === 'rectangle'} {...shared} />
                <SidebarButton icon={IcoCircle}   label="圓形"   onClick={() => setGeoTool('ellipse')}                    isActive={currentTool === 'geo' && activeGeo === 'ellipse'}   {...shared} />
                <SidebarButton icon={IcoTriangle} label="三角形" onClick={() => setGeoTool('triangle')}                   isActive={currentTool === 'geo' && activeGeo === 'triangle'}  {...shared} />
                <SidebarButton icon={IcoArrow}    label="箭頭"   onClick={() => { setTool('arrow'); setOpenPanel(null) }} isActive={currentTool === 'arrow'}                             {...shared} />

                <div style={{ height: 1, background: dividerColor, margin: '6px 0' }} />

                {/* ── 對齊工具 ── */}
                <AlignSubmenu
                    onAlign={alignSelected} isDark={isDark}
                    alignMenuBg={alignMenuBg} alignMenuBorder={alignMenuBorder} btnHover={btnHover}
                />
            </div>
        </>
    )
}
